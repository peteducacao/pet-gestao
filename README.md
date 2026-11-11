# PET Gestão · PET Educação/UFS

Central de atividades, demandas, cronogramas, comissões, memórias de reunião e notificações.

**Site:** https://peteducacao.github.io/pet-gestao/

## Situação
O código de integração com Cloudflare D1 e Google Apps Script está preparado. A implantação em produção exige o workflow do GitHub Actions concluído com sucesso e validação de login/e-mails. Não confundir código versionado com sistema testado em produção.

## Organização do projeto

| Arquivo | Finalidade |
|---|---|
| index.html, styles.css, live.css, app-live.js | Interface responsiva e acesso autenticado |
| config.js | Configuração pública local; no deploy, a URL da API é gerada automaticamente |
| worker/src/index.js | API do Cloudflare Worker |
| worker/migrations/0001_init.sql | Estrutura SQL e cadastro somente dos nomes das comissões |
| scripts/prepare-deploy.mjs | Descobre o banco D1 e prepara Worker e GitHub Pages |
| .github/workflows/pages.yml | Testes, migração, deploy Worker e Pages |
| docs/REGRAS-APROVADAS.md | Decisões de produto e comportamento |
| docs/AUDITORIA-REDUNDANCIAS-2026-11-11.md | Auditoria de botões, filtros e atalhos com decisões para avaliação |
| docs/IMPLEMENTACAO-2026-11-09.md | Guia técnico, segredos, publicação e checklist |

**Nenhum usuário, demanda, prazo ou reunião fictícia é carregado na versão real.** Os dados locais do protótipo não são importados.

## Infraestrutura
- GitHub Pages para a interface;
- Cloudflare Workers como servidor e D1 como banco de dados;
- Google Apps Script (MailApp) como ponte de envio de e-mails;
- sem R2 nem Google Drive; anexos exclusivamente nos envios manuais imediatos.

A conta Admin inicial é criada a partir dos segredos de Actions **ADMIN_EMAIL** e **ADMIN_INITIAL_PASSWORD**. Nunca colocar credenciais em JavaScript do navegador ou no histórico de commits.

## Implantação
Veja **docs/IMPLEMENTACAO-2026-11-09.md**. Antes de declarar a implantação concluída, conferir o workflow e executar o checklist manual de autenticação, demandas e notificações.

## Regras de negócio
Consulte **docs/REGRAS-APROVADAS.md**. O front-end é apenas a apresentação; validações e permissões ficam no Worker.

## Desenvolvimento local
O front-end é estático, mas depende da URL da API preenchida no arquivo config.js durante a publicação. Para pré-visualização local:
1. Disponibilizar a API em um Worker de desenvolvimento seguro, não reutilizar dados reais sem autorização.
2. Configurar apenas a URL pública no config.js (nunca tokens).
3. Executar um servidor HTTP estático, como python -m http.server 8000.
4. Executar testes de JavaScript/SQL e de API antes de publicar.

## Atenção
O repositório é público; não armazene anexos privados, dados sensíveis, chaves, senhas ou tokens aqui. Para exclusões definitivas, recomenda-se rotina de backup D1.

## Autenticação e experiências de navegação (novembro/2026)
- O PET Gestão permite **uma única conta por navegador**. A identidade de uma sessão ativa é compartilhada entre suas abas; trocar de conta revoga a sessão anterior desse navegador.
- **Manter-me conectado** utiliza apenas um token persistente; desmarcado, o token é compartilhado por um cookie temporário de sessão entre abas e não é guardado indefinidamente. Nunca colocar senha em localStorage, sessionStorage ou cookies.
- Sair da conta pede confirmação. Voltar do painel Admin ao PET Gestão exibe uma transição animada **sem encerrar o login**.
- Nos detalhes e na edição de demandas, **Texto para revisão** exibe quem fez a última alteração, o cargo e a data/hora, apoiado pelo histórico de auditoria.
- A página **Comissões** oferece um bloco de Ajuda ao final. **Nenhuma das redundâncias apontadas no relatório foi removida sem avaliação**.

## Testes relevantes
- `node scripts/test-auth-sessions.mjs`: tokens, compartilhamento temporário e regras de segurança.
- `node scripts/test-browser-sessions.mjs`: abre abas e troca contas no mesmo contexto Chromium (precisa de Playwright).
- `node scripts/test-browser.mjs` e `node scripts/test-ui.mjs`: interface responsiva e fluxos visuais.
- `node scripts/test-smoke.mjs`: API isolada, com Worker de desenvolvimento e banco D1 local.
- Workflows `.github/workflows/pages.yml`, `.github/workflows/smoke.yml` e `.github/workflows/integration-tests.yml` executam verificações e publicações.

**Importante:** não executar testes destrutivos no D1 de produção. A auditoria de redundâncias é consultiva; mudanças propostas precisam de autorização antes da remoção de elementos.
