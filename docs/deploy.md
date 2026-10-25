# Runbook de deploy

O build roda na sua máquina; o VPS só recebe um release pronto, instala 6 pacotes de runtime e
reinicia o serviço. Nada aqui foi executado no servidor ainda.

## Layout no servidor

```
/opt/study-site/
├── .env                 # configuração (DATA_DIR=./data — caminhos relativos partem daqui)
├── data/                # study.db + archives/<userId>/ (inalterados pela migração)
├── releases/<id>/       # um diretório por release (server.mjs, web/, node_modules/, activate.sh...)
├── app -> releases/<id> # release ativo (systemd e Caddy apontam para cá)
├── backups/             # study-<data>.db (10 últimos por padrão) e units systemd anteriores
└── site/, scripts/ ...  # checkout git da versão Astro (não é mais usado, fica para rollback)
```

- **systemd** (`study-site.service`): `node /opt/study-site/app/server.mjs`, com
  `APP_ROOT=/opt/study-site` e `EnvironmentFile=/opt/study-site/.env`.
- **Caddy**: serve `app/web` (SPA) e encaminha `/api/*` e `/admin/api/*` para `127.0.0.1:3000`.

## Primeira subida (migração da versão Astro)

1. **Backup manual antes de tudo** (no VPS):
   ```bash
   sudo systemctl stop study-site
   sudo tar czf /root/study-site-antes-do-rewrite.tgz -C /opt/study-site data .env
   sudo systemctl start study-site
   ```
2. **Ajuste o `.env`** (no VPS): a versão Astro resolvia caminhos a partir de `site/`
   (`DATA_DIR=../data`); a nova resolve a partir de `/opt/study-site`. Troque para:
   ```env
   DATA_DIR=./data
   ```
   (`SERVER_CACHE_TTL_DAYS` não é mais usada e pode ser apagada.) O `activate.sh` se recusa a
   continuar se `DATA_DIR` apontar para um lugar sem `study.db` enquanto `data/study.db` existir.
3. **Instale o rsync** se ainda não houver: `sudo apt-get install -y rsync`.
4. **Deploy** (na sua máquina, a partir da branch a publicar):
   ```bash
   scripts/deploy.sh <usuario>@<ip-do-vps>
   ```
   O `activate.sh` faz backup do banco, instala a unit nova (guardando a do Astro em
   `backups/study-site.service.<data>`), aponta `app` para o release, reinicia e verifica
   `GET /api/session`. Se o serviço não subir, volta sozinho para a unit e o release anteriores.
   A migration `0000` adota o schema atual sem alterá-lo; a `0001` remove a tabela
   `compiled_mdx_cache` (o cache agora fica no navegador).
5. **Troque o Caddyfile** para servir o SPA estático:
   ```bash
   scp scripts/Caddyfile.example <usuario>@<ip-do-vps>:/tmp/Caddyfile
   # no VPS: troque 203.0.113.10 no arquivo pelo IP do VPS (ou pelo domínio, sem "tls internal")
   sudo cp /tmp/Caddyfile /etc/caddy/Caddyfile
   sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
   ```
6. **Confira**: login, uma disciplina com capítulos, uma questão, upload/download em `/conta`,
   o admin e o sync (`python3 scripts/sync_archive.py --dry-run`).

## Atualizações

```bash
scripts/deploy.sh <usuario>@<ip-do-vps>
```

Cada release é identificado por data e commit (`20261025-101500-abc1234567`); com alterações não
commitadas o id ganha o sufixo `-dirty`. Os 5 releases mais recentes (contando o ativo) e os 10 últimos backups do banco ficam no servidor;
para mudar, defina `DEPLOY_KEEP_RELEASES` e `DEPLOY_KEEP_BACKUPS` no `.env` do servidor (mínimo 1).
O backup cobre só o `study.db`; os arquivos em `data/archives/` não são copiados pelo deploy.

## Rollback

- **Para um release anterior** (no VPS):
  ```bash
  ls -1t /opt/study-site/releases/
  sudo bash /opt/study-site/releases/<id-anterior>/activate.sh
  ```
- **Restaurar o banco** (só se um release tiver gravado dados incompatíveis):
  ```bash
  sudo systemctl stop study-site
  sudo cp /opt/study-site/backups/study-<data>.db /opt/study-site/data/study.db
  sudo rm -f /opt/study-site/data/study.db-wal /opt/study-site/data/study.db-shm
  sudo chown study:study /opt/study-site/data/study.db
  sudo systemctl start study-site
  ```
- **Voltar para a versão Astro**: o checkout em `/opt/study-site/site` continua intacto (o deploy
  novo não mexe nele; não rode `git pull` nele depois que o rewrite entrar na `main`).
  ```bash
  sudo cp /opt/study-site/backups/study-site.service.<data> /etc/systemd/system/study-site.service
  sudo systemctl daemon-reload
  # no .env, volte DATA_DIR=../data (a versão Astro resolve a partir de site/)
  sudo bash /opt/study-site/scripts/deploy.sh   # deploy antigo: build do Astro no VPS
  ```
  O Astro recria `compiled_mdx_cache` sozinho; a tabela `schema_migrations` é ignorada por ele.
  Restaure também o Caddyfile antigo (proxy de tudo para a porta 3000).

## Notas

- **Memória/CPU**: o servidor não renderiza mais markdown, KaTeX nem Shiki — isso roda no
  navegador. Arquivos estáticos ficam com o Caddy, com cache imutável para `/assets/*`.
- **Sem Caddy** (teste local de produção): `WEB_DIST_DIR=apps/web/dist npm start` serve o SPA
  pelo próprio Node.
- **Archive local**: em produção (`NODE_ENV=production`, definido pela unit) o `archive/` local
  nunca é usado, a menos que `ENABLE_LOCAL_ARCHIVE=true`.
