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
