# PET Educação

Central de organização do PET Educação — Universidade Federal de Sergipe.

Este repositório contém uma **versão de apresentação** com dados demonstrativos extraídos de textos fornecidos pelo solicitante. O site não possui contas, senhas ou e-mails de integrantes e não grava alterações compartilhadas. Os dados de teste são públicos porque este repositório é público.

## Estrutura do site

- **Visão geral:** indicadores, seis próximos prazos e seletor compacto de semanas com atividades do período.
- **Demandas:** acompanhamento mensal e semanal, pendências acumuladas e arquivadas.
- **Cronograma:** abre com todas as demandas ativas de todos os meses; permite alternar para seleção de mês, ano e semana. O calendário grande e o painel de preferências visuais foram retirados.
- **Comissões:** estrutura compartilhada, indicadores por equipe e agrupamento de tarefas por mês e semana; o exemplo de Legendas contém cronograma de postagens de novembro de 2026.
- **Memórias dos encontros:** agora disponíveis dentro da aba **Demandas**. A aba Reuniões foi removida do menu lateral, mantendo leitura, edição e personalização das memórias.
- **Registrar demandas:** exclusivamente criação e edição de demandas. A criação de memórias fica na seção **Memórias dos encontros** dentro de Demandas, sem aba separada. Em modo demo, as alterações persistem somente no navegador.
- **Minhas pendências:** atividades atribuídas ao usuário autenticado ou a um responsável de etapa, de todas as comissões. Na demonstração, é possível escolher um PETiano para visualizar suas pendências simuladas.
- **Administração:** entrada bloqueada até existir autenticação, autorização e backend, conforme o escopo aprovado.

## O que está habilitado agora

- Interface responsiva para computador e celular; navegação completa entre páginas públicas.
- Seletores de mês, ano e semanas; o cronograma não usa mais grade de calendário.
- Preferências anteriores permanecem nos dados locais, mas o painel **Preferências de navegação** deixou de ser exibido.
- Consulta manual de qualquer período, sem apagar ou arquivar dados.
- **Pendências semanais** na inicial: botões Semana 1–5, atividades abertas daquele intervalo e um único link **Ver cronograma**, que abre a lista completa de demandas.
- **Ver detalhes** abaixo de cada atividade, com prazos, responsáveis, observações já publicadas, texto salvo somente para leitura, histórico de autoria e data. A edição do texto ocorre exclusivamente no botão **Editar demanda**.
- **Situação da demanda:** controle rápido **Pendente, Aprovada e Concluída** na página **Ver detalhes**, fora do formulário de edição. A aprovação dá prioridade visual; somente a conclusão arquiva.
- A prévia utiliza perfis ilustrativos de autoria, mas não representa login institucional.
- Seleção de responsáveis por PETianos(as), por comissão ou todos, na criação e edição de demandas. Em **Prazos por etapa**, cada prazo aceita **mais de um responsável** (pessoas e comissões), cujos nomes aparecem como etiquetas; a lista fecha a cada seleção, preservando os itens marcados. O seletor de etapa agora tem apenas **Prazo** e **Correção**, e o botão **Salvar prazos** permanece ao lado de **Adicionar prazo**. Registros antigos são preservados.
- A **data de postagem é obrigatória** no formulário; atividades podem ser vinculadas a várias comissões sem cópias. Demandas concluídas ficam apenas em **Arquivadas**; grupos de semanas inteiramente concluídas somem do cronograma ativo.
- Memórias com fundos personalizáveis e prévia em tempo real, inclusive degradês em cores próprias. Cards com datas e responsáveis e situação Aprovada destacada.
- **Observações:** uma única caixa para o texto da atividade na edição, com autor da última alteração, data e horário, e botão **Copiar**; nos detalhes, consulta sem editor e sem painel duplicado de situação.
- **Comissões:** botão **Nova comissão** com formulário de nome, descrição e integrantes selecionáveis; editar e excluir com confirmação, em modo demonstrativo local.
- Exemplo de cronograma da comissão de **Legendas** (20 atividades, semanas 2, 3 e 4 de novembro) e uma reunião (22/10) com 15 demandas, sendo três identificadas como OK no registro original.
- Arquitetura de visualização pronta para substituição por registros reais de uma API autenticada.
- Tratamento de ausência de dados e erro de conexão sem apresentar contagens falsas.

## O que não está habilitado

**Ainda não há autenticação, banco de dados, cadastro compartilhado, permissões administrativas, extração automatizada das memórias ou envio/agendamento de e-mails.** As atividades iniciais são exemplos. **É possível criar e editar dados na demonstração, mas eles são salvos somente no armazenamento do navegador**, sem sincronização, autenticação, e-mail ou compartilhamento. O painel administrativo permanece bloqueado.

Isso é intencional: permitir operações compartilhadas antes de configurar autenticação e regras de acesso poderia comprometer dados da equipe.

## Arquivos

- `index.html`: estrutura de navegação e acessibilidade.
- `styles.css`: identidade visual e layout responsivo.
- `app.js`: páginas, filtros, listas, criação/edição de registros, acompanhamento semanal, autoria e contrato de leitura da API.
- `demo-data.js`: memória e cronograma para apresentação, sem informações de acesso; remover ao conectar os dados reais.
- `config.js`: configuração **pública**, sem segredos; `demoMode: true` ativa os exemplos somente quando `apiBaseUrl` estiver vazio.
- `assets/favicon.svg`: ícone vetorial.
- `docs/CONTRATO-API.md`: especificação para a integração futura.
- `docs/REGRAS-NEGOCIO.md`: regras funcionais aprovadas.

## Executar

Não há dependências de build. Para executar localmente:

```bash
python -m http.server 8000
```

Acesse `http://localhost:8000`.

A publicação pelo GitHub Pages foi preparada em `.github/workflows/pages.yml`, mas depende de o Pages estar habilitado nas configurações do repositório. **O repositório no GitHub, sozinho, não garante que o site esteja publicado.**

## Integração de API — fase posterior

Após configurar servidor, banco D1 e autenticação, altere somente a URL **pública** `apiBaseUrl` no arquivo `config.js`. O front-end consulta `GET /api/v1/bootstrap` com `credentials: include`. O backend precisa aplicar autorização antes de retornar informações privadas ou permitir operações.

Os dados esperados são descritos em [`docs/CONTRATO-API.md`](docs/CONTRATO-API.md). **Nunca inclua chaves de API, tokens de e-mail, credenciais do Cloudflare ou segredos no JavaScript público.**

## Validação

Foram realizados testes de funções de navegação, períodos, geração de HTML, criação/edição local de demandas, revisão da tutoria simulada e restauração do armazenamento local. A verificação visual em navegadores reais continua necessária. O sistema só poderá ser considerado operacional para a equipe após teste integrado com identidade, permissões, banco de dados, notificações e um domínio publicado.

## Atenção aos exemplos

Datas, responsáveis e estados exibidos na demonstração foram transcritos da memória e do cronograma apresentados, **não representam confirmação de execução em tempo real**. O registro escrito em 22/10 aponta Emoji, Lixeira e Semáforo como OK; essas três tarefas aparecem como concluídas somente para demonstrar a interface. O nome «Pene», encontrado no cronograma, foi preservado como dado a confirmar, sem atribuir a qualquer conta.

## Exclusões na demonstração

- Cada prazo no formulário possui **Remover prazo**. A retirada desse campo somente altera a atividade quando a demanda for salva.
- Demandas existentes podem ser excluídas pelo botão **Excluir demanda** na edição; memórias podem ser excluídas na lista ou no formulário de edição. O navegador pede confirmação antes de excluir o registro completo.
- As exclusões são representadas apenas no armazenamento local do navegador e **não modificam o arquivo de exemplos do GitHub**. Elas permanecem após atualizar a página nesse navegador. A exclusão de uma memória preserva as demandas que estavam vinculadas.
- No ambiente real, exclusões exigirão autenticação, autorização e trilha de auditoria no servidor.
