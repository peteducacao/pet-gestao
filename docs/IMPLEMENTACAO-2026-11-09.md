# PET Gestão — implementação e operação (09/11/2026)

## Status
Esta documentação descreve **o código preparado**, não é prova de publicação. O sistema só estará operacional após o workflow do GitHub Actions concluir e os testes reais de login e e-mail serem executados.

## Infraestrutura
- **GitHub Pages:** interface em https://peteducacao.github.io/pet-gestao/ — arquivos index.html, styles.css, live.css, app-live.js e config.js gerado durante o deploy. Sem dados fictícios.
- **Cloudflare Worker:** pet-gestao, implementado em worker/src/index.js; API com prefixo /api/v1 e Cron Trigger para envios agendados (verificação a cada cinco minutos).
- **Cloudflare D1:** pet-gestao-db, vinculado como DB. Migração em worker/migrations/0001_init.sql.
- **Google Apps Script:** PET Gestão - Notificações, com função doPost que verifica MAIL_BRIDGE_TOKEN e envia com MailApp. URL pública terminada em /exec.
- **Sem R2/Drive:** anexos foram retirados das demandas e dos e-mails agendados. Somente e-mails imediatos aceitam arquivos transitórios (até 10 MB por arquivo; total conservador de aproximadamente 14 MB).

## Segredos exigidos no GitHub Actions
Acesse Settings → Secrets and variables → Actions. Adicione:
| Nome | Uso |
|---|---|
| CLOUDFLARE_API_TOKEN | Token da Cloudflare com Workers Scripts Edit e D1 Edit |
| CLOUDFLARE_ACCOUNT_ID | ID da conta Cloudflare |
| ADMIN_EMAIL | Endereço da conta administrativa inicial |
| ADMIN_INITIAL_PASSWORD | Senha inicial do Admin (mínimo de 10 caracteres) |
| MAIL_BRIDGE_TOKEN | Token da ponte Worker → Apps Script, diferente do token Cloudflare |
| MAIL_BRIDGE_URL | URL /exec da implantação do Apps Script |

Opcional: a **variável** PET_GESTAO_API_URL em Actions, se a descoberta automática do subdomínio Worker falhar. Nunca publicar valores de Secrets em código, capturas ou conversa.

## Publicação
O workflow .github/workflows/pages.yml, ao atualizar main:
1. Valida sintaxe dos arquivos JS e a migração SQL com SQLite temporário.
2. Descobre ID de pet-gestao-db e subdomínio workers.dev.
3. Gera wrangler.json com binding DB, migrações e Cron Trigger.
4. Aplica a migração remota, publica Worker e configura segredos da API.
5. Testa os endpoints /api/v1/health e /api/v1/bootstrap.
6. Publica apenas a pasta _site no GitHub Pages.

Se Actions estiver vermelho, a implantação NÃO foi comprovada. Uma migração que já foi aplicada não é revertida por falha em passo posterior. Jamais apagar o banco ou o Inventário PET para tentar corrigir um erro.

No primeiro acesso à API, a conta Admin é criada **apenas se não existir um administrador**. A senha inicial é armazenada apenas como hash PBKDF2 com salt no D1. Após entrar, trocar a senha em Minha conta e remover ou rotacionar o segredo inicial.

## Banco
- users / sessions / auth_attempts / password_resets — contas, autenticação e recuperação.
- commissions / commission_members — comissões, ordem e limites de integrantes.
- tasks / task_history — demandas, prazos, conclusão por comissão e auditoria.
- meetings — memórias dos encontros.
- email_queue — agendamentos, envios e status (sem bytes de anexos).
- app_settings — atualização automática do mês e semana.

## Segurança
Cadastro público: Nome, E-mail e Senha, sem pergunta sobre sexo ou gênero. Papel inicial PETiano(a). Visitante não pode salvar nem acessar detalhes privados. O servidor verifica autenticação/autorização, não apenas a visibilidade dos botões.

Sessão usa token aleatório e hash no banco; navegador utiliza sessionStorage, com revogação no logout e após troca de senha. A senha é protegida por PBKDF2 com salt e 160 mil iterações.

Admin pode gerar senha temporária (exibida apenas uma vez, força troca na próxima entrada) e alterar cargos e preferências da Tutoria. O link de “Esqueceu sua senha?” expira em 30 minutos e só funciona uma vez. Login tem bloqueio após repetidas tentativas.

Admin pode excluir comissões, gerenciar vagas, ordem e e-mails. Outras pessoas autenticadas podem editar comissões/demandas, participar de comissão respeitando vagas, marcar conclusão de outras comissões e excluir demandas arquivadas, como aprovado. O histórico usa sempre o **nome real da conta** (Admin é exceção por ser o nome da conta administrativa).

## E-mails
Tutor(a) e Admin têm preferência “Perguntar se desejo notificar os(as) responsáveis por e-mail”. Quando habilitada, salvar observação, prazos, situação ou conclusão oferece confirmar o envio. Quando desabilitada, apenas salva. A preferência é sincronizada pelo D1.

E-mails manuais: públicos destinatários Todos(as), Comissões e Usuários; envio imediato aceita anexos transitórios; agendado não aceita anexos. Status: pendente, processando, enviado e falhou. Botão de limpeza remove só enviado/falhou, preservando pendentes/agendados. “Enviado” é aceito pelo Apps Script, não prova entrega na caixa postal.

## Dados iniciais reais
O D1 recebe somente os nomes das comissões: Vídeos, Cards, ImaginAÇÃO, CinePET, Salinha, Finanças, Legendas, Site, Comemorações e Impressora 3D. **Nenhuma demanda, memória ou pessoa fictícia** entra no banco. Não há importação automática do armazenamento local do protótipo.

## Lista de verificação depois do primeiro deploy
- [ ] Actions verde; API health com database=true; bootstrap sem exemplos.
- [ ] Visitante sem detalhes, cadastro e login.
- [ ] Admin inicial, alteração da senha, senha temporária e recuperação por e-mail.
- [ ] Configuração de vagas, bloqueio quando cheia e edição da cor/descrição.
- [ ] Demanda com prazo obrigatório, responsáveis e sequência correta das datas.
- [ ] Aprovação e conclusão antecipada com confirmação.
- [ ] Duas comissões: uma conclui, some somente da própria lista; após a segunda, Arquivadas.
- [ ] Exclusão definitiva arquivada preserva comissão.
- [ ] Histórico recolhível registra autor e horário.
- [ ] Preferência de avisos Tutor(a)/Admin e e-mail disparado com autorização.
- [ ] E-mails manuais, agendamento, anexos imediatos até 10 MB, fila e limpeza.
- [ ] Navegação, filtros e responsividade em computador e celular.

## Limites e recuperação
Aplicam-se as cotas de envio do MailApp, Apps Script e planos Cloudflare. Agendamentos não são garantidos no segundo exato. Não existe armazenamento persistente de arquivos. Backup do D1 deve ser planejado antes de operações destrutivas. Para reverter o front-end, reverter commits; para dados, usar backups do D1, não apagar tabelas.
