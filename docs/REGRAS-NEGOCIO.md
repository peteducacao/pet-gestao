# Regras de negócio — PET Gestão

## Princípio do produto

Toda comissão trabalha com **exatamente a mesma estrutura**: campos, atividades, responsáveis, observações, etapas, cronogramas, prazos, anexos e histórico. Mudanças na estrutura principal serão aplicadas a todas as comissões. Cada comissão gerencia livremente seus próprios registros, integrantes, tarefas, cronogramas e etapas conforme as permissões; o produto não terá telas específicas por comissão.

## Organização e datas

- Cada demanda possui identificação única e pode aparecer nas visões mensal, semanal, por comissão, por reunião e pessoal **sem duplicar o registro**.
- A visão mensal agrupa demandas cadastradas no período; a semanal limita ao período escolhido. Pendentes reúne demandas abertas **de qualquer mês ou ano**. Concluídas permanecem no histórico.
- Mês, ano e semana são seletores explícitos. Mudança automática de mês/ano e semana são duas opções independentes.
- O modo automático define apenas o período inicial ao entrar no site; a navegação manual fica sempre disponível.
- Se a atualização automática estiver desabilitada, a preferência manual de período deve ser mantida.
- Trocar de mês ou semana nunca altera, apaga ou arquiva atividades.
- Todo prazo possui etapa (produção, correção e outras configuráveis), data, hora e responsável; a hora padrão ao criar é **23:59**, mas é editável.
- Atividades podem ter múltiplos prazos com responsáveis diferentes, inclusive tutoria.

## Pessoas e comissões

- Os cargos do sistema são **PETiano(a), Tutor(a) e Administração** e são atribuíveis pela Administração.
- Uma pessoa pode acumular cargos; a ação de tutoria deve ser identificada pelo papel de tutor(a) validado no servidor.
- As comissões possuem integrantes padrão cadastráveis, editáveis e removíveis.
- No seletor de responsáveis, mostrar **primeiro todos os integrantes da comissão, inclusive tutoria**; depois os demais usuários cadastrados. É permitido selecionar qualquer usuário.
- **Minhas pendências** mostra tarefas abertas atribuídas à conta conectada, independentemente da comissão ou do mês. Concluídas saem da lista e permanecem no histórico.

## Reuniões e memórias

- Preservar o texto original de cada memória/ata.
- O recurso futuro de extração inteligente propõe demandas com título, responsáveis, prazos, etapas e vínculo da reunião; **o usuário revisa antes de confirmar**.
- Um trecho informativo não vira tarefa automaticamente. Nomes desconhecidos, `???` e prazos incertos não serão inventados.
- Vincular tarefas existentes, em vez de duplicá-las quando forem retomadas em encontros posteriores.
- Guardar registros de alterações, autoria e data.

## Observações e e-mails

- Observações ficam **separadas** dos textos principais, com autor, data e histórico.
- Alterações comuns por PETianos(as) são registradas, mas **não geram e-mail de correção**.
- Ações feitas com o papel de Tutor(a) (texto editado, etapa corrigida, observação adicionada ou corrigida, prazo ajustado, conclusão) podem gerar notificação automática para os destinatários autorizados, segundo as preferências administrativas.
- O e-mail identifica o tutor ou tutora que realizou a ação, a atividade e o link de acesso.
- **Se houver observação relacionada à alteração, incluir seu conteúdo no corpo da mensagem; se não houver, omitir todo o bloco**, sem frases como “sem observação”.
- O servidor deve evitar e-mails duplicados, preservar histórico e permitir ligar/desligar tipos de evento e editar modelos.
- Lembretes de prazo são um fluxo opcional e independente das notificações de revisão.

## Central administrativa futura

- A Administração gerencia usuários, cargos, comissões, etapas globais, configurações e direitos.
- Um editor de e-mail permitirá assunto, texto formatado, imagens, links e anexos, com destinatários “todos”, usuários específicos ou membros de comissão (deduplicados).
- Permitir envio imediato, agendamento com data e horário, edição ou cancelamento antes do disparo, modelos e histórico de envios/falhas.
- Dados sensíveis, funções de cadastro e painel administrativo permanecem inacessíveis até autenticação e autorização efetivas no backend.

## Integridade

- Arquivar e restaurar é diferente de excluir permanentemente. Exclusões devem exigir confirmação e permissão suficiente.
- Registro de auditoria contém autor, cargo exercido, data, tipo de alteração e identificador do objeto.
- A API é a única autoridade para permissões e persistência. Ocultar um botão no navegador **não** substitui segurança no servidor.
