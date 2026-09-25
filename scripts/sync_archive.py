#!/usr/bin/env python3
"""
Utilitário de Sincronização Incremental do Archive (ai-study)
Comunicação via API HTTP / REST com autenticação e validação segura.
"""

import sys
import os
import io
import ssl
import json
import base64
import zipfile
import hashlib
import argparse
import getpass
from pathlib import Path
import urllib.request
import urllib.error
import urllib.parse

# Extensões suportadas pelo sistema de archive
ALLOWED_EXTENSIONS = {
    '.md', '.mdx', '.json', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.txt'
}

# Cores ANSI para o terminal
class Colors:
    RESET = "\033[0m"
    BOLD = "\033[1m"
    GREEN = "\033[32m"
    RED = "\033[31m"
    YELLOW = "\033[33m"
    CYAN = "\033[36m"
    GRAY = "\033[90m"

def colorize(text: str, color: str) -> str:
    if sys.stdout.isatty():
        return f"{color}{text}{Colors.RESET}"
    return text

def load_dotenv(env_path: Path) -> dict:
    """Lê variáveis simples de um arquivo .env se existir."""
    env = {}
    if not env_path.is_file():
        return env
    try:
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#') or '=' not in line:
                    continue
                k, v = line.split('=', 1)
                k = k.strip()
                v = v.strip()
                if len(v) >= 2 and ((v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'"))):
                    v = v[1:-1]
                elif ' #' in v:
                    v = v.split(' #', 1)[0].strip()
                elif '\t#' in v:
                    v = v.split('\t#', 1)[0].strip()
                env[k] = v
    except Exception as e:
        print(colorize(f"Aviso ao ler {env_path}: {e}", Colors.YELLOW))
    return env

def compute_file_hash(filepath: Path) -> str:
    """Calcula o hash SHA-256 de um arquivo em disco."""
    h = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

def scan_local_archive(archive_dir: Path) -> dict:
    """Escanear arquivos locais do archive e calcular hashes SHA-256."""
    files = {}
    if not archive_dir.exists():
        return files

    for root, dirs, filenames in os.walk(archive_dir):
        # Ignora pastas ocultas ou de rascunho
        dirs[:] = [d for d in dirs if not d.startswith('.') and not d.startswith('_temp')]
        for fname in filenames:
            if fname.startswith('.') or fname.startswith('_temp'):
                continue
            ext = Path(fname).suffix.lower()
            if ext in ALLOWED_EXTENSIONS:
                full_path = Path(root) / fname
                rel_path = full_path.relative_to(archive_dir).as_posix()
                try:
                    stat = full_path.stat()
                    files[rel_path] = {
                        "size": stat.st_size,
                        "mtime": int(stat.st_mtime * 1000),
                        "hash": compute_file_hash(full_path),
                        "full_path": full_path,
                    }
                except Exception as e:
                    print(colorize(f"Erro ao ler arquivo {rel_path}: {e}", Colors.RED))
    return files

def build_http_request(url: str, method: str = "GET", headers: dict = None, data: bytes = None) -> urllib.request.Request:
    req = urllib.request.Request(url, data=data, method=method)
    if headers:
        for k, v in headers.items():
            req.add_header(k, v)
    return req

def make_request(req: urllib.request.Request, ssl_verify: bool = True):
    context = None
    if not ssl_verify:
        context = ssl._create_unverified_context()

    parsed = urllib.parse.urlparse(req.full_url)
    handlers = []

    # Se a URL for local, ignora proxies configurados no ambiente
    if parsed.hostname in ("localhost", "127.0.0.1", "::1"):
        handlers.append(urllib.request.ProxyHandler({}))

    if context:
        handlers.append(urllib.request.HTTPSHandler(context=context))

    if handlers:
        opener = urllib.request.build_opener(*handlers)
        return opener.open(req, timeout=60)
    return urllib.request.urlopen(req, timeout=60)

def main():
    parser = argparse.ArgumentParser(
        description="Sincronização bidirecional do archive local com o servidor VPS."
    )
    parser.add_argument("--url", help="URL base do site (ex: https://meu-vps.com ou http://localhost:3000)")
    parser.add_argument("--user", "-u", help="Nome de usuário para autenticação")
    parser.add_argument("--password", "-p", help="Senha para autenticação")
    parser.add_argument("--dir", "-d", help="Caminho do diretório archive local (padrão: archive/ no repositório)")
    parser.add_argument("--dry-run", "-n", action="store_true", help="Apenas compara e mostra as diferenças sem alterar nada")
    parser.add_argument("--yes", "-y", action="store_true", help="Executa a ação sem solicitar confirmação interativa")
    parser.add_argument("--push", action="store_true", help="Força direção Push (subir local para o servidor)")
    parser.add_argument("--pull", action="store_true", help="Força direção Pull (baixar do servidor para o local)")
    parser.add_argument("--insecure", "-k", action="store_true", help="Desabilita verificação de certificado SSL (para certificados autoassinados)")

    args = parser.parse_args()

    # Localiza a raiz do repositório
    script_dir = Path(__file__).resolve().parent
    repo_root = script_dir.parent

    # Carrega .env
    dotenv_vars = {}
    if (repo_root / ".env").is_file():
        dotenv_vars.update(load_dotenv(repo_root / ".env"))
    cwd_env = Path.cwd() / ".env"
    if cwd_env.is_file() and cwd_env.resolve() != (repo_root / ".env").resolve():
        dotenv_vars.update(load_dotenv(cwd_env))

    # Determina configurações
    site_url = (
        args.url
        or os.getenv("SYNC_SITE_URL")
        or dotenv_vars.get("SYNC_SITE_URL")
        or dotenv_vars.get("SITE_URL")
        or "http://localhost:3000"
    ).rstrip("/")

    username = (
        args.user
        or os.getenv("SYNC_USERNAME")
        or dotenv_vars.get("SYNC_USERNAME")
        or dotenv_vars.get("ADMIN_USERNAME")
        or "admin"
    )

    password = (
        args.password
        or os.getenv("SYNC_PASSWORD")
        or dotenv_vars.get("SYNC_PASSWORD")
        or dotenv_vars.get("ADMIN_PASSWORD")
    )

    insecure = (
        args.insecure
        or os.getenv("SYNC_INSECURE", "").lower() in ("true", "1", "yes")
        or dotenv_vars.get("SYNC_INSECURE", "").lower() in ("true", "1", "yes")
    )

    # Diretório local do archive
    archive_dir_str = (
        args.dir
        or os.getenv("SYNC_LOCAL_ARCHIVE_DIR")
        or dotenv_vars.get("SYNC_LOCAL_ARCHIVE_DIR")
        or str(repo_root / "archive")
    )
    archive_dir = Path(archive_dir_str).resolve()

    # Garante que o diretório archive exista (e resolve symlink se apontar para fora)
    if not archive_dir.exists():
        archive_dir.mkdir(parents=True, exist_ok=True)

    if not password:
        print(colorize(f"Configuração: Conectando a {site_url} como '{username}'", Colors.CYAN))
        password = getpass.getpass(f"Digite a senha para o usuário '{username}': ")

    if not password:
        print(colorize("Erro: A senha não pode estar vazia.", Colors.RED), file=sys.stderr)
        sys.exit(1)

    # Prepara autenticação HTTP Basic
    auth_str = f"{username}:{password}"
    auth_header = f"Basic {base64.b64encode(auth_str.encode('utf-8')).decode('ascii')}"

    headers = {
        "Authorization": auth_header,
        "User-Agent": "ai-study-sync-cli/1.0",
    }

    print(colorize("\n" + "=" * 60, Colors.BOLD))
    print(colorize(" Sincronização do Archive (ai-study)", Colors.BOLD))
    print(colorize("=" * 60, Colors.BOLD))
    print(f" Servidor : {colorize(site_url, Colors.CYAN)}")
    print(f" Usuário  : {colorize(username, Colors.CYAN)}")
    print(f" Local    : {colorize(str(archive_dir), Colors.GRAY)}")
    print(colorize("-" * 60, Colors.GRAY))

    # 1. Obtém manifesto remoto do servidor
    print("==> [1/3] Conectando ao servidor e obtendo manifesto remoto...")
    status_url = f"{site_url}/api/sync/status"
    req = build_http_request(status_url, method="GET", headers=headers)

    try:
        with make_request(req, ssl_verify=not insecure) as response:
            if response.status != 200:
                print(colorize(f"Erro HTTP {response.status} ao conectar ao servidor.", Colors.RED), file=sys.stderr)
                sys.exit(1)
            raw_data = response.read().decode("utf-8")
            data = json.loads(raw_data)
            remote_manifest = data.get("manifest", {})
            remote_files = remote_manifest.get("files", {})
            remote_user = remote_manifest.get("username", username)
            print(colorize(f"    Conectado com sucesso! Usuário remoto autenticado: {remote_user}", Colors.GREEN))
            print(f"    Arquivos no servidor: {len(remote_files)}")
    except urllib.error.HTTPError as e:
        if e.code == 401:
            print(colorize("Erro 401: Credenciais inválidas (usuário ou senha incorretos).", Colors.RED), file=sys.stderr)
        else:
            print(colorize(f"Erro HTTP {e.code}: {e.reason}", Colors.RED), file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(colorize(f"Erro ao conectar com {site_url}: {e.reason}", Colors.RED), file=sys.stderr)
        if "CERTIFICATE_VERIFY_FAILED" in str(e.reason):
            print(colorize("Dica: Se o VPS utiliza certificado autoassinado, adicione o parâmetro --insecure (-k).", Colors.YELLOW))
        sys.exit(1)
    except Exception as e:
        print(colorize(f"Erro inesperado: {e}", Colors.RED), file=sys.stderr)
        sys.exit(1)

    # 2. Escaneia arquivos locais
    print("==> [2/3] Escaneando arquivos locais e calculando hashes...")
    local_files = scan_local_archive(archive_dir)
    print(f"    Arquivos no computador local: {len(local_files)}")

    # 3. Compara os manifestos
    print("==> [3/3] Comparando diferenças entre local e remoto...")

    local_only = []
    remote_only = []
    modified_local = []
    modified_remote = []
    identical = []

    all_keys = sorted(set(local_files.keys()) | set(remote_files.keys()))

    for key in all_keys:
        loc = local_files.get(key)
        rem = remote_files.get(key)

        if loc and not rem:
            local_only.append(key)
        elif rem and not loc:
            remote_only.append(key)
        else:
            # Presente em ambos
            if loc["hash"] == rem["hash"]:
                identical.append(key)
            else:
                # Modificado: compara mtime
                if loc["mtime"] >= rem["mtime"]:
                    modified_local.append(key)
                else:
                    modified_remote.append(key)

    total_diffs = len(local_only) + len(remote_only) + len(modified_local) + len(modified_remote)

    print(colorize("\n" + "=" * 60, Colors.BOLD))
    print(colorize(" RESUMO DE DIFERENÇAS", Colors.BOLD))
    print(colorize("=" * 60, Colors.BOLD))
    print(f"  {colorize('[=]', Colors.GRAY)} Idênticos em ambos os lados : {len(identical)}")
    print(f"  {colorize('[+]', Colors.GREEN)} Novos apenas localmente      : {len(local_only)}")
    print(f"  {colorize('[~]', Colors.CYAN)} Mais recentes localmente     : {len(modified_local)}")
    print(f"  {colorize('[+]', Colors.YELLOW)} Novos apenas no servidor     : {len(remote_only)}")
    print(f"  {colorize('[~]', Colors.YELLOW)} Mais recentes no servidor    : {len(modified_remote)}")
    print(colorize("-" * 60, Colors.GRAY))

    if total_diffs == 0:
        print(colorize("✓ Tudo sincronizado! Não há diferenças entre local e servidor.\n", Colors.GREEN))
        sys.exit(0)

    # Mostra lista detalhada das diferenças se não for excessivamente longa
    def list_items(items, prefix, color, max_show=10):
        for idx, item in enumerate(items[:max_show]):
            print(f"    {colorize(prefix, color)} {item}")
        if len(items) > max_show:
            print(colorize(f"    ... e mais {len(items) - max_show} arquivos.", Colors.GRAY))

    if local_only:
        print(colorize("\nArquivos adicionados localmente:", Colors.BOLD))
        list_items(local_only, "[+ Local]", Colors.GREEN)

    if modified_local:
        print(colorize("\nArquivos modificados localmente:", Colors.BOLD))
        list_items(modified_local, "[~ Local]", Colors.CYAN)

    if remote_only:
        print(colorize("\nArquivos adicionados no servidor:", Colors.BOLD))
        list_items(remote_only, "[+ Remoto]", Colors.YELLOW)

    if modified_remote:
        print(colorize("\nArquivos modificados no servidor:", Colors.BOLD))
        list_items(modified_remote, "[~ Remoto]", Colors.YELLOW)

    print(colorize("\n" + "=" * 60, Colors.BOLD))

    # Se for apenas dry-run, encerra aqui
    if args.dry_run:
        print(colorize("Modo dry-run ativo. Nenhuma alteração foi realizada.", Colors.CYAN))
        sys.exit(0)

    # Seleção de direção
    action = None
    if args.push:
        action = "push"
    elif args.pull:
        action = "pull"
    else:
        print(colorize("O que você deseja fazer?", Colors.BOLD))
        print(f"  {colorize('[1]', Colors.CYAN)} Subir mudanças locais para o servidor ({colorize('PUSH', Colors.GREEN)})")
        print(f"      - Envia: {len(local_only) + len(modified_local) + len(modified_remote)} arquivos locais")
        print(f"      - Deleta no servidor: {len(remote_only)} arquivos excluídos localmente")
        print(f"  {colorize('[2]', Colors.CYAN)} Baixar mudanças do servidor para o local ({colorize('PULL', Colors.YELLOW)})")
        print(f"      - Baixa: {len(remote_only) + len(modified_remote) + len(modified_local)} arquivos do servidor")
        print(f"      - Deleta no computador: {len(local_only)} arquivos excluídos no servidor")
        print(f"  {colorize('[3]', Colors.GRAY)} Cancelar e sair")

        try:
            choice = input(colorize("\nEscolha uma opção [1/2/3]: ", Colors.BOLD)).strip()
        except (KeyboardInterrupt, EOFError):
            print("\nOperação cancelada.")
            sys.exit(0)

        if choice == "1":
            action = "push"
        elif choice == "2":
            action = "pull"
        else:
            print("Operação cancelada pelo usuário.")
            sys.exit(0)

    # Confirmação explícita
    if not args.yes:
        action_name = "PUSH (Local -> Servidor)" if action == "push" else "PULL (Servidor -> Local)"
        try:
            confirm = input(colorize(f"\nConfirma executar {action_name}? [s/N]: ", Colors.BOLD)).strip().lower()
        except (KeyboardInterrupt, EOFError):
            print("\nOperação cancelada.")
            sys.exit(0)

        if confirm not in ("s", "sim", "y", "yes"):
            print("Operação cancelada.")
            sys.exit(0)

    # ============================================================
    # EXECUÇÃO DO PUSH
    # ============================================================
    if action == "push":
        files_to_send = sorted(set(local_only + modified_local + modified_remote))
        deletions = remote_only

        print(colorize(f"\n==> Executando PUSH: Enviando {len(files_to_send)} arquivos e deletando {len(deletions)} no servidor...", Colors.CYAN))

        # Cria bundle ZIP em memória
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            for rel_path in files_to_send:
                full_path = local_files[rel_path]["full_path"]
                zf.write(full_path, arcname=rel_path)
        zip_bytes = zip_buffer.getvalue()

        # Monta multipart/form-data
        boundary = f"----WebKitFormBoundary{hashlib.md5(os.urandom(16)).hexdigest()}"
        body = io.BytesIO()

        # Campo: bundle (arquivo zip)
        if len(files_to_send) > 0:
            body.write(f"--{boundary}\r\n".encode("utf-8"))
            body.write(b'Content-Disposition: form-data; name="bundle"; filename="sync-bundle.zip"\r\n')
            body.write(b"Content-Type: application/zip\r\n\r\n")
            body.write(zip_bytes)
            body.write(b"\r\n")

        # Campo: deletions (JSON)
        body.write(f"--{boundary}\r\n".encode("utf-8"))
        body.write(b'Content-Disposition: form-data; name="deletions"\r\n')
        body.write(b"Content-Type: application/json\r\n\r\n")
        body.write(json.dumps(deletions).encode("utf-8"))
        body.write(b"\r\n")

        body.write(f"--{boundary}--\r\n".encode("utf-8"))
        body_bytes = body.getvalue()

        push_headers = dict(headers)
        push_headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
        push_headers["Content-Length"] = str(len(body_bytes))

        push_url = f"{site_url}/api/sync/push"
        req = build_http_request(push_url, method="POST", headers=push_headers, data=body_bytes)

        try:
            with make_request(req, ssl_verify=not insecure) as response:
                result = json.loads(response.read().decode("utf-8"))
                if result.get("success"):
                    print(colorize(f"\n[✓] PUSH concluído com sucesso!", Colors.GREEN))
                    print(f"    Arquivos atualizados no servidor: {result.get('updatedCount', 0)}")
                    print(f"    Arquivos deletados no servidor  : {result.get('deletedCount', 0)}\n")
                else:
                    print(colorize(f"Erro retornado pelo servidor: {result.get('error')}", Colors.RED), file=sys.stderr)
                    sys.exit(1)
        except Exception as e:
            print(colorize(f"Erro ao enviar dados para o servidor: {e}", Colors.RED), file=sys.stderr)
            sys.exit(1)

    # ============================================================
    # EXECUÇÃO DO PULL
    # ============================================================
    elif action == "pull":
        files_to_fetch = sorted(set(remote_only + modified_remote + modified_local))
        deletions = local_only

        print(colorize(f"\n==> Executando PULL: Baixando {len(files_to_fetch)} arquivos e deletando {len(deletions)} no computador local...", Colors.CYAN))

        pull_url = f"{site_url}/api/sync/pull"
        pull_data = json.dumps({"files": files_to_fetch}).encode("utf-8")

        pull_headers = dict(headers)
        pull_headers["Content-Type"] = "application/json"
        pull_headers["Content-Length"] = str(len(pull_data))

        req = build_http_request(pull_url, method="POST", headers=pull_headers, data=pull_data)

        updated_count = 0
        if len(files_to_fetch) > 0:
            try:
                with make_request(req, ssl_verify=not insecure) as response:
                    if response.status != 200:
                        print(colorize(f"Erro HTTP {response.status} ao baixar arquivos.", Colors.RED), file=sys.stderr)
                        sys.exit(1)
                    zip_data = response.read()

                # Extrai arquivos baixados com segurança sobre archive_dir
                zip_buffer = io.BytesIO(zip_data)
                with zipfile.ZipFile(zip_buffer, "r") as zf:
                    for member in zf.infolist():
                        if member.is_dir():
                            continue
                        clean_name = os.path.normpath(member.filename).lstrip("/\\")
                        if ".." in clean_name:
                            continue
                        dest_path = archive_dir / clean_name
                        dest_path.parent.mkdir(parents=True, exist_ok=True)
                        with zf.open(member) as src, open(dest_path, "wb") as dst:
                            dst.write(src.read())
                        updated_count += 1
            except Exception as e:
                print(colorize(f"Erro ao baixar pacote do servidor: {e}", Colors.RED), file=sys.stderr)
                sys.exit(1)

        # Deleta arquivos locais que foram excluídos no servidor
        deleted_count = 0
        for del_path in deletions:
            clean_rel = os.path.normpath(del_path).lstrip("/\\")
            if ".." in clean_rel:
                continue
            target_path = archive_dir / clean_rel
            if target_path.is_file():
                try:
                    target_path.unlink()
                    deleted_count += 1
                    # Remove diretórios vazios até archive_dir
                    parent = target_path.parent
                    while parent != archive_dir and parent.is_relative_to(archive_dir):
                        if not any(parent.iterdir()):
                            parent.rmdir()
                            parent = parent.parent
                        else:
                            break
                except Exception as e:
                    print(colorize(f"Erro ao remover arquivo local {target_path}: {e}", Colors.RED))

        print(colorize(f"\n[✓] PULL concluído com sucesso!", Colors.GREEN))
        print(f"    Arquivos atualizados/baixados no computador: {updated_count}")
        print(f"    Arquivos excluídos no computador          : {deleted_count}\n")

if __name__ == "__main__":
    main()
