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
- Arquivadas: exclusão definitiva exclusiva do Admin, com confirmação; remoção de registro, etapas e histórico, sem excluir cadastros de comissão.

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
- Administração também envia e-mails manuais/agendados com editor WYSIWYG, seleção de destinatários, monitor de fila e histórico. Envio imediato aceita anexos transitórios; envio agendado não aceita anexos. Nenhuma demanda aceita anexos de arquivos.
- Apenas ações da tutoria/Admin oferecem notificações automáticas; PETiano(a) não dispara por editar sua própria demanda.

## Comissões e permissões
- Nomes das dez comissões reais são preservados; nenhum registro fictício entra na produção. A Administração define vagas e ordenação dos cards; participação segue regras existentes.
- Tutor(a) e PETiano(a) utilizam a área comum; Admin usa sessão própria protegida. Servidor valida autenticação e escopo, não apenas o front-end.
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
- Excluir demanda ativa requer confirmação destrutiva; Tutoria pode excluir ativas e PETiano(a) apenas a que criou. Arquivadas continuam exclusivas da conta Admin. Excluir elimina etapas, participações e histórico no banco, mantendo comissões cadastradas.
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
- **Salvar demanda em Editar demanda permanece no topo ao lado de Voltar**; não repetir no rodapé. O formulário de criação mantém Salvar no rodapé. Nenhuma alteração de banco, vínculo ou regra de conclusão.


## E-mails de prazo e pré-visualização — 10/11/2026
- Somente a Administração configura, no painel de E-mails, os avisos automáticos independentes **Prazo vencendo** e **Prazo vencido**. Ambos iniciam desativados para impedir disparos inesperados; a antecedência padrão do primeiro é 3 dias, editável entre 1 e 30 dias.
- O aviso de **Prazo vencendo** é registrado uma vez quando faltam exatamente os dias configurados para a data da etapa. O aviso de **Prazo vencido** é registrado uma vez após o horário limite, dentro do próprio dia ou dia seguinte. Usar a data civil de Sergipe (America/Maceio).
- Avisar somente responsáveis pendentes da etapa (quando houver seleção específica) ou participantes pendentes da demanda/comissões vinculadas. Excluir quem já concluiu sua participação; nunca notificar demandas arquivadas. Não enviar e-mail repetido para a mesma etapa, mesmo após várias execuções do agendador.
- O Admin edita assunto e corpo por tipo de mensagem, incluindo modelos separados de criação, revisão, prazo vencendo e prazo vencido. Variáveis disponíveis: {autor}, {acao}, {demanda}, {tipo}, {etapa}, {prazo}, {dias} e {link}. Alterar um modelo não modifica os demais.
- Os formulários de e-mails manuais e modelos possuem botão de **Pré-visualizar**, que apresenta assunto, destinatários e conteúdo formatado em janela própria, sem gravar alterações nem enviar mensagens. Os dados de exemplo nos modelos são meramente ilustrativos.
- O processamento automático usa Cloudflare Cron e a fila Gmail existente. Registros de lembrete são deduplicados em tabela própria, removida em cascata quando a demanda é excluída. E-mails não devem ser disparados por testes da interface.
- A exclusão definitiva de demandas ativas permanece autorizada à Tutoria, à Administração autenticada e ao(à) PETiano(a) criador(a). Demandas arquivadas são exclusivas da sessão Admin; o servidor valida essas permissões e elimina demanda, etapas e histórico sem remover comissões. O teste de integração local deve validar o fluxo.

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
- Demandas ativas podem ser **excluídas** por PETianos(as), Tutoria e Administração com autenticação e confirmação, mesmo que tenham sido criadas por outro integrante. A exclusão definitiva de demandas arquivadas continua restrita à sessão administrativa. O servidor é a autoridade das permissões.
