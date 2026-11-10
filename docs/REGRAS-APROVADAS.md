# PET Gestão — regras aprovadas de produto (09/11/2026)

**Esta é a referência funcional das decisões confirmadas.** Não confundir com o registro do que foi efetivamente testado ou publicado: consultar IMPLEMENTACAO-2026-11-09.md.

## Navegação e visualização
- Caminho de navegação clicável e botão Voltar em páginas internas; preservar mês/ano/semana.
- A Visão geral mostra até seis próximos prazos, status explícitos pendente, aprovada, atrasada; concluídas não devem aparecer nas áreas ativas.
- Filtros por mês, ano e semana nos cronogramas e em Arquivadas. Admin controla atualização automática do período padrão; mesmo ativada, a consulta manual permanece.
- Sem conta: somente navegação e visualização da área Organização, sem “Ver detalhes” nem operações.
- Nomes, datas e registros fictícios do protótipo não são migrados para a versão real.

## Conta e acesso
- Cadastro: Nome, E-mail, Senha, sem sexo/gênero, seguindo o Inventário PET.
- Cargos: PETiano(a), Tutor(a), Administração. Cargo exibido em Minha conta; nenhuma assinatura usa prefixo.
- Conta própria assina com o nome cadastrado, mesmo quando utiliza a Administração. A conta administrativa se chama Admin.
- O painel Admin é EXCLUSIVO da conta Administração, autenticada diretamente pela entrada administrativa (#/admin). Tutor(a) entra na Visão geral pela entrada comum e não pode acessar nenhum endpoint administrativo.
- Cada sessão possui escopo atribuído no servidor: uma sessão comum (mesmo que alguém altere seu JavaScript ou suas requisições) nunca vira sessão Admin. Somente o login administrativo emite escopo administrativo. O Worker valida cargo e escopo em cada operação privilegiada.
- As funções acordadas da Tutoria (criar e revisar demandas, observações, correções, prazos, memórias e notificações automáticas) permanecem nas páginas comuns. Gestão de cargos, senhas, configuração, vagas, e-mails manuais/agendados e exclusões definitivas é exclusiva da Administração.
- Admin gera senha temporária e o próximo login exige mudança; “Esqueceu sua senha?” envia link de uso único, expirando em 30 minutos.
- PETiano(a) autenticado(a) pode visualizar e interagir em todas as comissões, mesmo sem ser integrante.

## Comissões
- Preservar nomes das comissões; remover somente registros fictícios.
- No formulário de comissão: Descrição altera o texto exibido no card; Fundo do card tem Restaurar cor padrão.
- Menu ⋮: Editar para contas autenticadas; Excluir somente para Admin; para PETiano(a), “Fazer parte” (ou “Sair” se integrante).
- Ingressar requer confirmação. Admin estabelece vagas máximas por comissão (0 significa sem limite); ao atingir a lotação, não permite novas entradas.
- Administração organiza a ordem global dos cards; edição da comissão e memórias ficam nas páginas usuais, sem duplicar seção Admin.

## Demandas
- Uma demanda pode aparecer em Visão geral, Demandas, Comissões, Cronogramas e Minhas pendências — sempre o mesmo registro, sem cópias.
- Cadastro exige título, pelo menos um responsável ou comissão, e no mínimo uma etapa Prazo com data. Correção e Postagem são opcionais.
- Etapas: Prazo, Correção e Postagem; retirar campo separado Data de postagem. Correção recebe sugestão da pessoa cadastrada como Tutor(a), sem nome fixo.
- Prazos não podem ser cadastrados em anos anteriores; Correção não pode anteceder Prazo; Postagem não pode anteceder a etapa anterior.
- Seleção de responsáveis: Todos(as), Comissões, PETianos(as), sem outra área redundante de vinculação.
- Visualização de atividade: situação Pendente / Aprovada / Concluída com botão Salvar, Observações com lápis e botão Salvar; cada alteração registra autoria e hora.
- Histórico de alterações recolhível mostra pessoa, ação e data. “Últimas atualizações” realça acompanhamento e revisões.
- Conclusão antecipada, quando há prazos futuros, exige confirmação e marca etapas pendentes daquela comissão como concluídas com a data real.
- Para duas ou mais comissões, **cada comissão confirma separadamente**, mas qualquer PETiano(a) logado(a) pode confirmar a outra. A demanda desaparece da comissão que concluiu e permanece nas outras e nas demandas gerais até todas finalizarem. Um aviso deve informar quais ainda faltam.
- Só após todas confirmarem, a demanda vai para Arquivadas e desaparece das áreas ativas.
- Arquivadas: filtros de período e exclusão definitiva com confirmação, **exclusiva da conta Administração autenticada no painel**; apaga o registro em todo o sistema e preserva os cadastros das comissões.
- Sem anexos nas demandas, devido à decisão de não contratar armazenamento externo.

## E-mails e notificações
- Apenas ações feitas por Tutor(a) ou Admin podem propor notificações automáticas aos(às) responsáveis; ações de PETiano(a) não perguntam nem enviam notificações automáticas.
- Minha conta da Tutoria e Administração tem preferência para ativar/desativar a pergunta “Deseja notificar os(as) responsáveis por e-mail?”. O Admin pode alterar essa preferência no perfil de outro usuário; deve sincronizar.
- Perguntar ao salvar observações, prazos, situação, conclusão e outras intervenções relevantes. Desativado significa não perguntar nem notificar automaticamente.
- Admin: e-mail manual ou agendado para Todos(as), Comissões e Usuários, com data e horário configuráveis; status pendente, enviado e falhou visíveis.
- Histórico de e-mails: limpar só registros finalizados, preservar pendentes/agendados.
- E-mail manual imediato pode incluir vários arquivos com até 10 MB por arquivo (respeitando limite total). E-mail agendado NÃO recebe anexos, e demandas NÃO recebem anexos.
- Integração escolhida: Cloudflare Worker + D1 + Google Apps Script MailApp, não Gmail API com OAuth manual nem R2.

## Administração
Áreas necessárias: Usuários (cargo, preferências e senha temporária), vagas das comissões, ordenação de cards, navegação automática dos cronogramas, e-mails e histórico de envios. Reuniões, arquivamento, edição de comissões e integrantes são geridos fora do Admin em seus próprios lugares.

## Memórias de reunião
Em cada item textual da memória, usar “Responsável: (Nome)” ou “Responsável: (???)”. Memórias são registradas na seção Demandas → Memórias, sem duplicar demandas.
