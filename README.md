# Cadernos de Estudo Acadêmico (PDS & Disciplinas de Engenharia)

Sistema integrado para estudos universitários com visual clássico e minimalista de **livro didático / publicação acadêmica**, desenvolvido em **Astro**, **KaTeX**, **Tailwind CSS v4** e orquestrado pela Skill **`question-study-generator`** no **Antigravity CLI**.

---

## 📖 Destaques da Arquitetura

1. **Menu Lateral na Home e em Todas as Páginas**:
   - Menu lateral esquerdo fixo no desktop e com gaveta discreta no mobile.
   - Na **Home (`/`)**: Lista de disciplinas cadastradas (com atalhos diretos), atalho para configurações e estado das matérias.
   - No **Caderno da Matéria (`/[materia]`)**: Sumário hierárquico com âncoras para rolagem suave para cada capítulo e subseção, além do índice de questões resolvidas.
2. **Dois Botões Redondos Discretos de Ação**:
   - **Ícone Redondo de Modo de Leitura**: Sem texto, apenas o ícone usual. Ao clicar, abre o menu flutuante com as opções **Papel / Sépia (`theme-paper`)**, **Escuro Tradicional (`theme-dark`)** e **Preto OLED Puro (`theme-oled`)**.
   - **Ícone Redondo de Engrenagem**: Leva diretamente à **Página de Configurações (`/configuracoes`)**.
3. **Página de Configurações Pessoais de Leitura (`/configuracoes`)**:
   - **Família Tipográfica**: Escolha entre *Garamond / Newsreader* (Padrão Livro Clássico), *Lora / Charter*, *Inter / Sistema* ou *JetBrains Mono*.
   - **Tamanho da Fonte**: 16px (Pequeno), 18px (Padrão), 20px (Grande) ou 22px (Muito Grande).
   - **Largura Máxima do Texto**: Compacta (~672px), Padrão Livro (~768px), Ampla (~896px) ou Máxima (~1088px).
   - **Prévia ao Vivo**: Caixa interativa demonstrando o efeito das configurações em tempo real.
   - **Restaurar Padrão**: Botão para retornar instantaneamente todas as preferências aos valores padrão de fábrica.
4. **Seção "Continuar Estudando" (Recentes)**:
   - Identifica automaticamente a última matéria que você acessou através do `localStorage`.
   - Oferece um botão direto **"Continuar Caderno &rarr;"** para retomar a leitura imediatamente.
5. **Contenção Total de Layout e Scroll Horizontal Independente**:
   - Blocos de equações KaTeX (`.katex-display`) e tabelas teóricas ganham rolagem horizontal independente com contenção rígida, sem quebrar as margens nem causar vazamento de layout no celular.

---

## 🚀 Como Executar Localmente

```bash
cd site
npm run dev
```

Acesse no navegador: **`http://localhost:4321`**

Para compilar a versão final estática:
```bash
cd site
npm run build
```
