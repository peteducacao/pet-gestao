# PET Gestão — decisões funcionais consolidadas (10/11/2026)

Este documento consolida o planejamento aprovado. A implementação e os testes devem ser verificados no histórico do GitHub Actions; não presumir publicação apenas pela presença do código.

## Princípio geral
Sistema simples, didático e sem duplicidade, voltado à organização do PET Educação. Demandas é o cadastro central: outras páginas apenas consultam os mesmos registros, sem cópias. Links de navegação interna devem permitir abrir em novas guias (inclusive Comissões, Demandas, Atas e Meu perfil).

## Navegação
- Visão geral: indicadores, seis próximas demandas em aberto e atalho para Demandas; cards compactos.
- Demandas: visões mensal, semanal e Concluídas (arquivadas), com mês/ano/semana e seletor simples de status. Sem barra de busca textual.
- Cronograma: não ter página repetida no menu; a visão de Demandas cobre seus períodos.
- Comissões: cards de equipes, com menu ⋮ para manutenção; dentro de cada comissão, **somente a lista de pendências** vinculadas, sem criar demanda, sem editar comissão e sem seletores de período na página interna. Ver detalhes abre o cadastro central.
- Atas de Reunião: página própria imediatamente abaixo de Demandas no menu, sem duplicação em Demandas. Filtros **Todas** e **Recentes** (sem Arquivadas); cards clicáveis abrem editor da ata, com título/data e texto, botão Salvar e menu ⋮ de Editar/Excluir.
- Minhas pendências: apenas participações individuais ainda não concluídas do usuário, removidas imediatamente depois da conclusão, mesmo que a demanda continue com outros responsáveis.
- Perfil: nome, e-mail, campo **Status** para papel da conta, preferência de avisos para Tutoria/Admin; senha por botão que revela o formulário. Cabeçalho sem nome, cargo e data repetidos.
- Cadastro: campo **Usuário** em vez de Nome, mantendo e-mail e senha.

## Demandas e responsáveis
- Título, pelo menos uma pessoa ou comissão e etapa **Prazo** com data são obrigatórios. Etapas **Correção** e **Postagem** opcionais, com data/horário e responsável, sem indicadores individuais de status: o registro permite identificar responsáveis.
- Seleção rápida por três categorias: Todos(as), Comissões e Pessoas. Seleções de Pessoas e Comissões são independentes e combináveis. Selecionar duas pessoas de Vídeos **não vincula** a demanda à comissão Vídeos.
- Status geral automático: **Pendente roxo** (#7954D4), **Atrasada vermelho** (#DC4444) por prazo vencido e **Concluída verde** (#279765). Atrasada não é ação manual.
- Conclusão individual ou conjunta selecionando quaisquer pessoas e/ou comissões vinculadas. Quem registra fica identificado no histórico. Não exigir aprovações extras.
- Uma demanda só vai para Concluídas/Arquivadas quando todas as pessoas e comissões vinculadas tiverem concluído suas participações. Conclusão antecipada com prazo futuro exige confirmação.
- Em atividade com várias comissões, a seção **Andamento das comissões** mostra o status de cada uma e fica oculta em demandas sem essa necessidade. Não mostrar mensagens redundantes de “Nenhuma comissão” junto aos responsáveis.
- Arquivadas: exclusão definitiva por PETiano(a), Tutor(a) ou Administração, com confirmação; remove demandas, etapas e históricos, mas mantém comissões cadastradas.

## Textos
- **Anotações da comissão:** bloco de notas livre. Ajuda curta: “Registre ideias, lembretes, combinados e informações importantes para a demanda.”
- **Texto para revisão:** texto que PETiano(a) escreve ou cola para revisão direta pela tutoria. Ajuda: “Escreva ou cole aqui o conteúdo da demanda para revisão da tutoria.”
- Editores WYSIWYG nos campos da demanda e nos e-mails do Admin: negrito, itálico, sublinhado, cores, listas; emojis, hashtags, caracteres especiais e parágrafos preservados.
- Links colados aparecem como texto simples no site, **não** como links clicáveis.
- Atas têm editor simples de texto com Salvar. Nos registros de cada item, indicar “Responsável: (Nome)” ou “Responsável: (???)”.
- Textos longos devem preservar quebras de linha/linhas em branco e nunca cortar palavras ou sobrepor cards.

## Notificações e Administração
- Ao criar uma demanda, Tutor(a)/Admin pode escolher se deseja notificar todos os responsáveis vinculados. Pessoas recebem individualmente; nas comissões, usar e-mails dos integrantes; Todos(as) abrange usuários elegíveis. Deduplicar endereços.
- Ao editar **Texto para revisão**, a Tutoria/Admin pode escolher se deseja notificar os responsáveis. Evitar pergunta para pequenas alterações não relacionadas a essa revisão.
- Preferência “Perguntar se desejo notificar” desligada implica salvar sem pergunta e sem envio.
- Administração possui **modelo editável** da notificação automática (assunto + texto rico), com variáveis automáticas de autor, ação, demanda e tipo.
- Administração também envia e-mails manuais/agendados com editor WYSIWYG, seleção de destinatários, monitor de fila e histórico. E-mail imediato aceita anexos transitórios; e-mail agendado não aceita anexos. **Demandas possuem armazenamento próprio de arquivos**, independente do envio por e-mail.
- Apenas ações da tutoria/Admin oferecem notificações automáticas; PETiano(a) não dispara por editar sua própria demanda.

## Comissões e permissões
- Nomes das dez comissões reais são preservados; nenhum registro fictício entra na produção. A Administração define vagas e ordenação dos cards; participação segue regras existentes.
- PETiano(a), Tutor(a) e Administração entram pelo mesmo formulário e usam a mesma sessão. Após login, a Administração tem acesso a Visão geral, Demandas, Minhas pendências, Comissões e Meu perfil como os demais, com o botão exclusivo **Painel Admin** no menu. O botão **Voltar ao PET Gestão** sai do painel sem encerrar a sessão; **Sair da conta** encerra a sessão integralmente. O Worker concede `admin_scope=1` exclusivamente ao login válido de uma conta com cargo Admin e exige esse escopo em cada endpoint administrativo.
- Histórico de alterações recolhido nos detalhes, com evento, responsável, data e horário, inclusive conclusão conjunta.

## Testes e proteção
- Não apagar nem modificar dados de produção para teste. Usar banco local isolado para criar, editar e excluir registros fictícios; depois rodar smoke tests de interface.
- Revisar links e abertura em nova guia, responsividade PC/celular, fluxo de conclusão, arquivamento, histórico, tratamento de erros, preferência de avisos e integração de e-mail.

## Exibição dos cards e Minhas pendências — 10/11/2026
- No formulário de demanda, escolher **Visão geral e comissões** (padrão; mantém registros anteriores visíveis) ou **Somente nas comissões** (apenas quando houver comissão vinculada). A escolha determina apenas o posicionamento do card, **não torna a demanda privada**.
- Todas as demandas continuam em **Demandas**; todas as comissões vinculadas mostram a atividade em sua área. A Visão geral apresenta somente as marcadas para exibição geral, com os mesmos cards horizontais de Demandas, tanto no PC quanto no celular.
- **Minhas pendências** mostra atividades individuais e todas as atividades de comissões das quais a pessoa participa. Se ela estiver marcada individualmente e também na comissão, mostrar **um único card**. Não copiar nem duplicar registros no banco.
- A conclusão individual continua independente da conclusão da comissão. Quando houver só uma participação pendente do usuário, **Concluir** realiza aquela participação; quando houver mais de uma, abre o seletor para escolher. O botão **Concluir** deve ser pequeno e alinhado, nunca esticado ocupando a largura inteira.
- O card inteiro deve abrir os detalhes da demanda, permitindo também abrir em outra guia. Conclusão da comissão faz a pendência desaparecer para os integrantes daquela comissão; conclusão pessoal remove apenas a pendência individual, e o arquivamento depende de todas as participações.
- Migração segura: `overview_visible` adicionado com padrão verdadeiro (`1`) para não ocultar atividades já cadastradas.

## Ajustes finais dos detalhes — 10/11/2026
- Colocar o quadro de **Responsáveis imediatamente abaixo de Prazos e etapas**, com informações de pessoas e equipes. Texto para revisão e histórico ficam na coluna oposta.
- A barra de ações dos detalhes fica com **Editar demanda**, **Status** e **Excluir**. Remover o botão Voltar duplicado; a seta de voltar no cabeçalho permanece.
- No seletor de status, a opção de ação é **Concluído** (substituindo "Registrar conclusão"). A seleção abre o fluxo seguro de escolha de pessoas/comissões: nenhuma alteração isolada de cor pode arquivar uma demanda incompleta.
- Excluir demandas ativas ou concluídas requer confirmação destrutiva. PETiano(a), Tutor(a) e Administração podem excluir mesmo quando outra pessoa criou. Remove etapas, participações e histórico, preservando as comissões.
- Ao concluir qualquer participação, **não perguntar se deseja notificar e não enviar e-mail automático**. Notificações opcionais da Tutoria permanecem somente na criação de demanda e na alteração do Texto para revisão.
- Histórico: usar ícones vetoriais (SVG) consistentes e maiores, em vez de emojis semelhantes aos de aplicativos de mensagens.
- Remover o indicador "Conectado" do menu lateral, inclusive quando a conexão não estiver disponível. Falhas ainda aparecem nos avisos do sistema.

## Layout aprovado e seletores — 10/11/2026
- Aplicar a mesma identidade visual leve (branco, roxo e espaçamento) aos cards das demandas e aos detalhes, sem adicionar elementos redundantes.
- Detalhes: **Prazos e etapas** à esquerda, com **Postagem** em cima quando presente e **Prazo / Correção** na faixa de baixo; **Responsáveis** diretamente abaixo; **Histórico de alterações** na coluna direita, expansível/recolhível; **Texto para revisão** embaixo, ocupando a largura completa.
- Não exibir legenda roxa redundante de “Comissões vinculadas” no quadro Responsáveis. O cartão da comissão mostra nome e integrantes. As pessoas escolhidas individualmente continuam visíveis, sem serem confundidas com participação pela comissão.
- Se uma demanda estiver vinculada só à comissão, mostrar os nomes dos integrantes no campo de responsáveis do card (quando disponíveis à conta). Não gravar atribuições individuais implicitamente nem revelar dados pessoais na visão pública.
- Um único seletor **Visualização** controla o que é pertinente em Demandas (Todas/Pendentes/Atrasadas/Concluídas), Comissões/Minhas pendências (Todas/Pendentes/Atrasadas) e Atas (Todas/Recentes). Seletor separado de período mantém Mês/Ano/Semana e Mensal/Semanal. Nos detalhes, Visualização funciona como atalho filtrado à página Demandas.
- Nunca criar filtros repetidos ou seletor sem função; não adicionar filtros nas páginas Perfil/Admin apenas para uniformizar a aparência.

## Cards de demandas — seletor de nomes (10/11/2026)
- Preservar integralmente o layout da página (sidebar, título, filtros, cores, status e botão Ver detalhes), alterando apenas a organização interna dos cards compartilhados por Visão geral, Demandas, Comissões e Minhas pendências.
- Abaixo do título, manter **comissões vinculadas** e **responsáveis individuais** como duas categorias separadas. Nomes de integrantes da comissão **NUNCA** se tornam responsáveis individuais apenas pelo vínculo. Continuam, entretanto, podendo concluir sua participação na própria comissão e vendo a demanda em Minhas pendências.
- Quando só há uma comissão, apresentar **só o nome da comissão** como chip sem seta. Quando há uma única pessoa responsável, apresentar o nome sem seta. Se não houver pessoas individuais, **não mostrar campo vazio nem “Não definido”**.
- Quando houver mais de um item na categoria, exibir o primeiro nome seguido de **+N** em um seletor expansível que mostra toda a lista; fechar ao clicar fora ou em outro seletor. Os ícones diferenciam pessoas e comissões. A expansão não deve abrir a demanda e deve funcionar no celular e com teclado.
- Remover do card a coluna redundante “Responsáveis”, mantendo **status, data e Ver detalhes** com distribuição proporcional sem vácuo. O card permanece inteiramente clicável e pode abrir em nova guia.
- **Salvar demanda em Editar demanda permanece no topo, sem botão Voltar redundante**; não repetir no rodapé. O formulário de criação mantém Salvar no rodapé. Nenhuma alteração de banco, vínculo ou regra de conclusão.


## E-mails de prazo e pré-visualização — 10/11/2026
- Somente a Administração configura, no painel de E-mails, os avisos automáticos independentes **Prazo vencendo** e **Prazo vencido**. Ambos iniciam desativados para impedir disparos inesperados; a antecedência padrão do primeiro é 3 dias, editável entre 1 e 30 dias.
- O aviso de **Prazo vencendo** é registrado uma vez quando faltam exatamente os dias configurados para a data da etapa. O aviso de **Prazo vencido** é registrado uma vez após o horário limite, dentro do próprio dia ou dia seguinte. Usar a data civil de Sergipe (America/Maceio).
- Avisar somente responsáveis pendentes da etapa (quando houver seleção específica) ou participantes pendentes da demanda/comissões vinculadas. Excluir quem já concluiu sua participação; nunca notificar demandas arquivadas. Não enviar e-mail repetido para a mesma etapa, mesmo após várias execuções do agendador.
- O Admin edita assunto e corpo por tipo de mensagem, incluindo modelos separados de criação, revisão, prazo vencendo e prazo vencido. Variáveis disponíveis: {autor}, {acao}, {demanda}, {tipo}, {etapa}, {prazo}, {dias} e {link}. Alterar um modelo não modifica os demais.
- Os formulários de e-mails manuais e modelos possuem botão de **Pré-visualizar**, que apresenta assunto, destinatários e conteúdo formatado em janela própria, sem gravar alterações nem enviar mensagens. Os dados de exemplo nos modelos são meramente ilustrativos.
- O processamento automático usa Cloudflare Cron e a fila Gmail existente. Registros de lembrete são deduplicados em tabela própria, removida em cascata quando a demanda é excluída. E-mails não devem ser disparados por testes da interface.
- A exclusão definitiva de demandas ativas e concluídas é permitida a PETiano(a), Tutor(a) e Administração autenticados, inclusive quando criada por outra pessoa; o servidor valida as permissões e elimina demanda, etapas e histórico sem remover comissões. O teste de integração local deve validar o fluxo.

## Layout dos detalhes e destinatários dos atrasos — 10/11/2026
- Os painéis **Responsáveis** e **Andamento das comissões** são recolhíveis e expansíveis com o próprio cabeçalho tanto em PC quanto em celular. Ambos iniciam abertos e não escondem nem alteram informações salvas; os prazos e o histórico preservam os seus comportamentos.
- No celular, centralizar horizontalmente o conjunto de ícone e informações da etapa **Postagem** acima das etapas Prazo e Correção, sem alterar alinhamentos de outras etapas.
- No Admin > E-mails > Avisos automáticos de prazo, **Prazo vencido** mantém ativação/desativação independente e ganha seletor de público: *Somente participantes pendentes* (compatibilidade padrão) ou *Todos(as) que fazem parte da demanda*. Este segundo abrange as pessoas designadas e integrantes das comissões vinculadas, inclusive quem já concluiu sua participação, enquanto a demanda ainda estiver ativa. Não repetir endereço nem aviso para a mesma etapa; demandas arquivadas e etapas concluídas não geram alertas.
- Ao desligar o aviso, conservar a seleção de público para quando ele for reativado; limitar a configuração ao Admin e validá-la no Worker. O aviso de prazo vencendo permanece voltado a pendências.
- Validar comportamento e centralização por testes automatizados com dimensões de celular e PC.

## Demandas sem etapas e conclusão coletiva — 10/11/2026
- Os **prazos por etapa são opcionais**. Quem registra ou edita uma demanda pode remover todas as etapas, salvar `deadlines: []` e voltar ao formulário sem que a etapa Prazo reapareça automaticamente. Uma etapa adicionada exige tipo e data válidos, mas não é necessário adicionar especificamente a etapa Prazo.
- A lista de demandas sem etapa utiliza a data de registro como referência de calendário, não gera alertas automáticos de vencimento e mostra **Sem etapas cadastradas** nos detalhes.
- A janela de conclusão conjunta deve oferecer uma opção **Marcar todos**, que seleciona/desmarca de uma só vez todas as pessoas e comissões ainda pendentes. A seleção manual atualiza o seletor geral (marcado, desmarcado ou parcial), sem concluir até o usuário confirmar explicitamente.
- Em demandas atribuídas a **Todos(as)**, qualquer usuário com cargo PETiano(a), Tutor(a) ou Administração pode registrar, com confirmação, a conclusão para todos os responsáveis vinculados à demanda, mesmo que outro cargo tenha criado a demanda. Conclusões antecipadas exigem a confirmação de prazos futuros, e autor, data e participantes concluídos ficam no histórico.
- Demandas ativas e concluídas podem ser **excluídas** por PETianos(as), Tutoria e Administração autenticados, mesmo se criadas por outra pessoa. O aviso de confirmação destrutiva é obrigatório. O servidor é a autoridade das permissões.

## Correção pela Tutoria e conclusão por participante — 10/11/2026
- Ao salvar uma **alteração real no Texto para revisão**, tanto no editor de detalhes quanto em Editar demanda, o(a) Tutor(a) participante tem sua revisão pessoal registrada e deixa de ver aquela demanda em **Minhas pendências**. A regra vale com `notify=true` ou `notify=false`, sem depender do disparo efetivo do e-mail.
- A revisão concluída pelo(a) Tutor(a) **não** conclui sua comissão, não muda as participações dos demais usuários, não arquiva a demanda e não a retira de Visão geral nem de Demandas. Esses locais só mudam com a conclusão efetiva de todas as participações.
- O registro é individual por `(task_id, user_id)`, mantido em tabela privada com exclusão em cascata, e o bootstrap informa apenas `tutorReviewedByMe` à sessão autenticada, sem publicar a situação pessoal dos demais.
- Quando há vários responsáveis a concluir, o diálogo oferece **Só minha participação**, **Marcar todos** e a seleção manual. Se a pessoa estiver vinculada somente por comissão, o botão informa que concluirá sua(s) comissão(ões), não as pessoas individualmente. O envio de notificação é independente da conclusão.

## Exclusão da própria conta — 10/11/2026
- Todos os perfis autenticados, inclusive **Usuário** com acesso somente de leitura, têm a opção **Meu perfil → Excluir minha conta**. A exclusão exige senha atual, digitar literalmente **EXCLUIR MINHA CONTA** e confirmar a ação em um segundo aviso; cancelar não altera nenhum dado.
- A API `DELETE /api/v1/account` obtém o usuário exclusivamente da sessão autenticada, não aceita identificar terceiros, apaga a própria conta, encerra sessões, cancela vínculos e elimina credenciais. A última Administração não pode ser excluída até existir outra conta administrativa responsável.
- Demandas, atas e históricos institucionais permanecem. Referências de autoria técnica nas demandas são repassadas à conta administrativa restante; nome e e-mail são anonimizados nos históricos e registros de e-mail, participações em comissões e pendências pessoais são removidas. E-mails anteriormente entregues a terceiros não podem ser recolhidos.
- A interface de **Todos(as)** deve conter apenas a **Data do evento**, sem campos de tipo de etapa, horário ou responsável por etapa. O evento segue com conclusão automática após a data informada. Forçar atualização das versões do JavaScript/CSS na publicação para evitar exibir o formulário antigo em cache.

## Conclusão e data individual, exclusão de arquivadas em lote — 10/11/2026
- **Todos(as)** corresponde a um evento coletivo: apenas a data (dia e mês vazios, ano corrente preenchido, editável), sem Prazo/Correção/Postagem, concluído automaticamente ao fim do dia indicado. Eventos antigos com data já passada são arquivados no salvamento ou ao carregar as demandas.
- **Uma pessoa** selecionada, sem comissões, corresponde a uma atividade individual: mostrar somente **Data da atividade**, com dia e mês para preencher e ano atual já preenchido. Não pedir tipo de etapa, horário ou responsável por etapa. Salvar uma etapa interna `Atividade`, sem conclusão automática; o(a) responsável marca a conclusão quando terminar. Uma data passada não arquiva a atividade individual.
- **Duas ou mais pessoas**, ou comissões, continuam com prazos por etapa opcionais. Alternar os modos preserva as etapas quando possível e permite voltar ao modo de data única.
- **Demandas → Concluídas:** PETiano(a), Tutor(a) e Administração veem o botão **Excluir demandas**, que abre caixas de seleção no período, com **Selecionar todas**, seleção individual, **Excluir selecionadas (N)** e **Cancelar**. A confirmação explícita é obrigatória; a API exige perfil de edição e verifica que todas as demandas do lote estão concluídas antes de executar exclusão em lote. Demandas pendentes nunca são removidas por essa função.
- O asterisco de data deve permanecer alinhado ao rótulo no celular e no computador. Os modelos e avisos automáticos de prazo ficam em **Configurações** no Admin, e as comissões utilizam **Salvar todas as alterações**.

## Login único da Administração — 10/11/2026
- O campo de login aceita e-mail de qualquer usuário ou o identificador `Admin` para a conta administrativa principal, usando a senha já existente.
- Nenhuma segunda tela ou segunda senha é solicitada para abrir o Painel Admin. O botão permanece oculto para perfis não administrativos, inclusive Tutor(a).
- Quem estiver conectado como Admin pode acessar e editar demandas pelas páginas comuns. Alterações administrativas continuam verificadas no servidor, e sessões de perfis comuns não ganham privilégios por tentar acessar a URL `#/admin` ou chamar APIs diretamente.
- Sessões antigas da entrada administrativa são migradas localmente quando não há outra sessão comum ativa. O token separado antigo é descartado e as credenciais não são expostas no front-end.

## Permanência da sessão e entrada neutra — 10/11/2026
- A tela pública de login deve indicar apenas **E-mail** e **Digite seu e-mail**, sem mencionar Administração, Painel Admin nem identificadores especiais. O painel permanece acessível apenas após login autorizado.
- **Manter-me conectado** significa sessão persistente no dispositivo até a própria pessoa sair da conta; não existe mais limite de 30 dias. A API mantém a sessão em banco com data sentinela máxima, revogável a qualquer momento. A opção desmarcada usa armazenamento temporário no navegador e uma sessão de até 7 dias.
- Em ambos os casos, trocar ou redefinir a senha, excluir a conta ou revogar a sessão invalida o acesso. A limpeza dos dados do navegador ou restrições de armazenamento também podem exigir novo login.
- No navegador, a sessão persistente do armazenamento local prevalece sobre tokens temporários antigos quando o site é reaberto. Jamais armazenar senhas no cliente.

## Visualização de demandas e conclusão mista — revisão em novembro/2026
- Em **Demandas**, o seletor de visualização contém somente **Todas as demandas**, **Pendentes**, **Atrasadas** e **Concluídas**. A opção **Geral** foi removida a pedido. **Todas as demandas** conserva a listagem anterior.
- Ao tocar em **Concluir** em Minhas pendências, mesmo que a pessoa tenha apenas uma pendência própria, verificar se existem outras participações pendentes na mesma demanda (pessoas e comissões). Havendo mais de uma, abrir o diálogo **Concluir participações** com **Só minha participação**, **Marcar todos** e as caixas de seleção individuais de **Pessoas** e **Comissões**. Não chamar a API diretamente antes de uma seleção confirmada.
- Exemplo obrigatório: demanda vinculada à Administração, à Tutoria e à comissão Finanças. Administrador(a) deve conseguir concluir só a própria participação ou selecionar quaisquer das três; a demanda só é arquivada quando todas forem concluídas. O mesmo vale para o acionamento pelo detalhe e pelos botões de comissão.
- Se resta somente uma participação na demanda, a confirmação direta continua válida. Prazos futuros ainda exigem confirmação de conclusão antecipada, depois da escolha de participantes.

## Painel das comissões, remoção dos dados de teste e proteção de rascunho — 10/11/2026
- Toda página de comissão apresenta, antes de **Pendências da comissão**, quatro indicadores: **Demandas** (total de registros vinculados à comissão, inclusive arquivados), **Concluídas** (participação daquela comissão já concluída, ainda que outras não tenham concluído), **Atrasadas** (participação não concluída e prazo vencido) e **Pendentes** (participação não concluída e sem prazo vencido). Cada demanda se enquadra em exatamente um dos três estados, logo Demandas = Concluídas + Atrasadas + Pendentes. Layout com quatro colunas no desktop e duas no celular.
- A migração `0011_limpeza_cenarios_teste.sql` exclui somente os identificadores técnicos da bateria de teste criada na migração `0010`: 24 demandas, três usuários fictícios e cinco mensagens originalmente agendadas (além de avisos associados). Não apagar demandas de outras origens, mesmo com título iniciado em `[TESTE]`, nem comissões ou usuários reais.
- Ao **criar ou editar uma demanda**, qualquer alteração não salva nos campos, responsáveis, comissões, etapas, datas ou editores de texto faz aparecer o diálogo **Alterações não salvas** ao tentar navegar: **Continuar editando** mantém formulário/valores; **Sair sem salvar** abandona o rascunho. Se nada mudou, sair sem aviso. Salvar com sucesso não apresenta o aviso. Ao recarregar ou fechar a página, o navegador emite a confirmação de saída nativa quando houver alterações.

## Exclusão de concluídas para PETianos(as), Tutoria e Administração — 10/11/2026
- Não exigir conta Admin nem Painel Admin para apagar demandas concluídas. Após selecionar **Concluídas** em Demandas, todos os perfis autenticados de **PETiano(a), Tutor(a) e Administração** têm acesso a **Excluir demandas**, seleção individual, **Selecionar todas**, **Excluir selecionadas (N)** e confirmação destrutiva. O perfil **Usuário**, somente leitura, não possui acesso de exclusão.
- A exclusão individual nos detalhes de uma demanda concluída segue a mesma regra de cargos. Nenhuma sessão desses três perfis recebe acesso ao painel de administração por essa permissão.
- O Worker valida o cargo no endpoint autenticado `POST /api/v1/tasks/bulk-delete`, e recusa lote vazio, duplicado ou contendo demanda inexistente/ativa. Limite máximo: 100 IDs por operação. O caminho antigo da API permanece como compatibilidade de cache, sem conceder privilégios administrativos adicionais.

## Revisão integrada de interface, e-mails e sessões — novembro/2026
- Em **Demandas → Concluídas**, o botão **Excluir demandas** aparece ao lado de **+ Registrar demanda**, em estilo próprio e compacto no celular. Ao iniciar a seleção, os cards ganham uma área grande e legível para marcar; **Selecionar todas** e **Excluir selecionadas (N)** permanecem dentro da área de seleção e a confirmação final é obrigatória. **Geral** não deve constar no seletor.
- O menu administrativo móvel fecha suavemente ao tocar fora, escolher Atas, Demandas, Usuários, Comissões, E-mails ou Configurações, e também ao voltar para a área comum. Não manter a gaveta aberta sobre a próxima tela.
- Em **Meu perfil**, mostrar **Minhas comissões** pelos vínculos de `commission_members`, sem criar vinculação inexistente nem modificar a composição das equipes.
- Em **Admin → E-mails**, **Agendar envio** é um botão de alternância, sem checkbox e sem seletor nativo. O comando principal é **Enviar** para envio imediato e **Agendar envio** no modo agendado. O editor de assunto/mensagem não pode ser apagado simplesmente ao trocar o modo.
- Uma notificação gerada por Tutor(a) ou Administração não deve enviar e-mail ao próprio autor; igualmente, um e-mail manual da Administração não deve ter o e-mail da conta remetente entre os destinatários. Quando houver apenas o próprio autor como destinatário, não solicitar envio de notificação e não criar mensagem vazia. A migração `0013` retira autores de mensagens antigas ainda pendentes/agendadas; mensagens já enviadas não podem ser recolhidas.
- Ao criar demanda ou salvar texto para revisão com notificação habilitada, perguntar claramente **Salvar e enviar** ou **Salvar sem enviar**. Ambas opções salvam a alteração; apenas a primeira solicita envio. Não usar **Cancelar** para significar salvar sem enviar.
- Avisos informativos sem confirmação nem segredo fecham-se sozinhos em **3 segundos**, sem cronômetro. Confirmações de exclusão, saída sem salvar, senha ou notificação não fecham automaticamente.
- **Últimas atualizações** da Visão geral e **Últimas alterações** no painel Admin possuem **Limpar tudo** quando há itens visíveis. Limpa somente a visualização pessoal, com registro temporal em `users.activity_cleared_at`; não apaga o histórico institucional das demandas.
- Um navegador só pode manter **uma identidade autenticada por vez**, mesmo em várias abas: `browser_id` identifica o navegador; nova autenticação revoga a sessão anterior desse mesmo navegador no Worker e `session-revision` sincroniza as abas. Em outra aba, a identidade deve ser atualizada para a conta atual independentemente de marcar a persistência. A verificação não afeta outros navegadores/dispositivos.

## Revisão de navegação, auditoria e ajuda — 11/11/2026
- **Uma conta em todas as abas:** após autenticar, abrir uma nova aba do mesmo site no mesmo navegador deve reconhecer imediatamente a identidade vigente, mesmo com **Manter-me conectado** desmarcado. Uma sessão temporária usa cookie de **sessão do navegador** com `SameSite=Strict`, restrito ao caminho do PET Gestão e sem `Max-Age` ou `Expires`; a opção marcada usa `localStorage`. A opção desmarcada não se converte em persistência indefinida. Nunca armazenar a senha no navegador.
- **Troca de identidade:** se uma pessoa entrar com outra conta no mesmo navegador, o Worker revoga a sessão anterior associada ao `browser_id`, e as abas abertas recebem a revisão em `localStorage`, atualizam a identidade e desativam permissões antigas. Novas abas leem o cookie temporário ou o token persistente da conta vigente. No caso de falha ou revogação, nenhuma ação protegida pode usar o token anterior.
- **Voltar ao PET Gestão, a partir do Admin:** apresentar o popup **Voltando ao PET Gestão...** com animação breve e indicação de que a área comum está sendo preparada. A navegação preserva o login, sem logout nem segundo formulário, e fecha o popup quando a interface estiver pronta.
- **Logout:** clicar em **Sair da conta** apresenta confirmação explícita: **Continuar conectado** e **Sim, sair da conta**. Cancelar não altera a sessão. Confirmar revoga o token no Worker e apaga o token local/cookie do navegador; a mudança é propagada para as demais abas.
- **Última alteração no texto para revisão:** perto do conteúdo, tanto nos detalhes como em **Editar demanda**, apresentar discretamente **Última alteração: nome (cargo) · data e hora**, preferindo o histórico específico do texto. Na ausência desse histórico nos registros antigos, usar os dados da última alteração da demanda. O Worker registra a ação `Atualizou texto para revisão` quando esse conteúdo muda; o histórico completo permanece disponível.
- **Ajuda geral:** no menu lateral **Organização**, imediatamente abaixo de **Comissões**, disponibilizar a página própria **Ajuda** com perguntas expansíveis sobre funcionamento do PET Gestão, Demandas, Conclusão, Atas, E-mails, Conta e Comissões. Não manter bloco de Ajuda repetido no rodapé da listagem de Comissões.
- **Auditoria de redundância:** o relatório `docs/AUDITORIA-REDUNDANCIAS-2026-11-11.md` aponta potenciais sobreposições de links, seletores e atalhos; suas seis propostas dependem de aprovação antes de qualquer remoção. Não confundir atalhos para o mesmo destino com registros duplicados no banco.
- **Regressões obrigatórias:** testar duas abas (persistente e temporária), troca de conta, cancelamento/aceitação do logout, retorno animado do Admin, metadados de revisão e Ajuda em Comissões. A publicação só deve ser considerada concluída após execução bem-sucedida dos workflows correspondentes.

## Fila de notificações vinculada a demandas — 11/11/2026
- Toda notificação automática nova de criação, revisão, prazo vencendo ou vencido guarda o ID da demanda em `email_queue.task_id` (migração `0014_email_vinculo_demanda.sql`).
- Antes de enviar, o Worker verifica se a demanda existe e está ativa. Para lembretes de prazo, também verifica se a etapa e a data originais continuam iguais e se a etapa não foi concluída. Avisos obsoletos ficam com status `cancelado`.
- Excluir demanda individualmente ou em lote cancela os avisos automáticos ainda pendentes/falhos, inclusive os de criação e revisão. Editar prazos/responsáveis ou concluir uma participação invalida lembretes pendentes; o próximo cron só recria os avisos que correspondem às regras e datas atuais.
- A migração cancela mensagens automáticas antigas pendentes sem ID de demanda, que não poderiam ser validadas. E-mails manuais independentes não são afetados. E-mails já entregues não podem ser desfeitos.
- A validação ocorre imediatamente antes de tentar enviar. Uma exclusão concorrente a um envio já em andamento pode não impedir a entrega; o sistema não promete revogar e-mail já transmitido à ponte Gmail.

## Simplificações aprovadas — 11/11/2026
- Em conclusão de participações mistas, manter **Só minha participação**, seleção individual e **Marcar todos**; retirar o atalho redundante **Concluir para todos(as)**.
- Remover botão textual **Voltar** duplicado dos formulários de comissão, demanda e ata, mantendo a seta de navegação e o aviso de alterações não salvas.
- Menu administrativo exclusivo para Painel, Usuários, Comissões, E-mails e Configurações. Retirar atalhos de Demandas e Atas e a ação rápida **Nova demanda** da área Admin. A área comum permanece acessível pelo botão **Voltar ao PET Gestão**.
- Manter resumo **Fila e histórico do Gmail** e **Acompanhar envios**, porque o primeiro é um resumo de status e o segundo permite inspeção detalhada.

## Atualização — Ajuda geral e notificações ligadas à demanda (11/11/2026)
- A Ajuda pertence ao **menu Organização, logo após Comissões**. Não é um bloco ao final da listagem de comissões nem um item do Painel Admin. A página `#/ajuda` pode ser consultada sem alterar cadastros, apresenta orientações gerais e inclui as dúvidas específicas de comissões como uma de suas seções.
- **Conclusão de demandas mistas:** manter apenas o atalho **Só minha participação**, as caixas individuais e **Marcar todos** (checkbox que seleciona/desmarca todas as pendências). Remover o segundo atalho redundante de concluir todos. A operação só ocorre após confirmação.
- **E-mails no Admin:** preservar o resumo **Fila e histórico do Gmail** e o detalhamento **Acompanhar envios**. São níveis diferentes de informação, não duplicidades a remover.
- Mensagens automáticas vinculadas à demanda possuem `email_queue.task_id` (migração `0014_email_vinculo_demanda.sql`); a fila verifica a existência da demanda e o prazo atual antes de marcar processamento, e revalida novamente imediatamente antes da chamada ao serviço de e-mail.
- Ao **excluir uma demanda**, cancelar as notificações vinculadas que ainda não saíram da fila; ao **alterar os prazos ou a demanda**, cancelar os avisos antigos e somente produzir os novos de acordo com os prazos vigentes. Alterações no texto de revisão cancelam avisos antigos ainda não entregues.
- Avisos já enviados não podem ser recolhidos. Uma mensagem que já iniciou entrega externa pode ter saído antes da atualização; o sistema não deve alegar que consegue desfazer um envio externo em andamento. E-mails manuais não associados a uma demanda não são afetados por sua exclusão.
- O Painel Admin reúne apenas **Painel, Usuários, Comissões, E-mails e Configurações**; Demandas e Atas permanecem na área comum. Formulários não repetem botão textual Voltar quando já existe seta de navegação.

## Fotos leves nas demandas e no Meu perfil — 11/11/2026
- **Somente fotos nas demandas:** PETianos(as) podem selecionar **várias fotos de uma vez**, até **8 fotos por demanda**. Formatos originais aceitos são imagens compatíveis com o navegador, convertidas e compactadas localmente para **JPG**. PDFs, documentos, planilhas, arquivos compactados e outros anexos são recusados.
- **Proteção real de acesso:** somente conta autenticada cujo cargo efetivo seja **PETiano(a)** pode listar metadados, enviar, visualizar, baixar ou excluir fotos da demanda. **Tutoria, Administração, usuários somente leitura e visitantes não têm acesso**, mesmo conhecendo a URL. O Worker verifica essa permissão em todas as operações, e o bootstrap só inclui a lista de fotos da demanda para PETianos(as).
- **Economia de espaço:** cada foto é reduzida no navegador, normalmente a até 1440 px no maior lado e com tamanho final **máximo de 350 KB**. Limite por demanda: **2,8 MB** para as oito fotos. Isso reduz o uso de Cloudflare D1, mas o consumo deve ser acompanhado ao longo do tempo; este recurso **não usa R2**.
- **Persistência:** depois de salvar a demanda, as fotos ficam privadas em `task_attachments` e `task_attachment_chunks` (Cloudflare D1, migração `0015`) com gravação em partes de até 256 KiB. Os metadados aparecem após recarregar, e cada foto pode ser aberta num visualizador e baixada. Os arquivos não entram automaticamente em e-mails.
- **Foto de perfil:** qualquer conta autenticada pode definir ou remover a própria foto em **Meu perfil**. O navegador a recorta para formato quadrado, reduz a até 320 × 320 px e a **no máximo 100 KB**, em JPG. O servidor armazena em `users.profile_photo` (migração `0016_foto_perfil.sql`), e devolve a foto somente ao titular na sessão. A lista geral de usuários não precisa transportar fotos.
- O Worker valida tamanho, tipo declarado e assinatura inicial JPEG antes de publicar a foto da demanda. A foto de perfil também exige data URI de JPEG. Não confiar apenas no atributo `accept="image/*"` do navegador.
- **Exclusão:** retirar uma foto não remove as outras; excluir uma demanda remove suas fotos e seus blocos associados. Demandas concluídas conservam fotos anteriores para PETianos(as) consultarem, mas não recebem novos uploads. Uploads incompletos antigos são limpos automaticamente.
- **Testes:** negar listagem/download/upload a visitantes, Usuários, Administração e Tutoria; confirmar inclusão, abertura, download e remoção independente de duas fotos pelo PETiano; rejeitar PDF e tamanho excessivo; verificar a foto de perfil, remoção e preservação das demandas reais. 

## Campo de senha com tamanho livre — 11/11/2026
- Todos os campos de senha (entrar, cadastrar, alterar no Meu perfil, recuperar/redefinir e confirmar exclusão) aceitam **algarismos, letras e símbolos**, sem limite máximo de caracteres configurado.
- Para criar e definir uma senha nova, exigir apenas um valor não vazio. O antigo mínimo de 10 caracteres e o teto de 200 foram retirados do formulário e das rotas `/auth/register`, `/auth/change-password` e `/auth/reset`.
- A autenticação continua usando hash PBKDF2 e limite de tentativas, sem armazenar a senha em texto simples. O limite geral de tamanho das requisições continua valendo para proteção do servidor, independentemente do campo de senha.
- **Orientação de segurança:** embora senhas curtas sejam aceitas por escolha do usuário, recomendar senhas longas e difíceis de adivinhar. Não mostrar senha em logs, URL ou mensagens públicas.
- Testar senha numérica curta e senha com mais de 200 caracteres, incluindo login e troca de senha.
