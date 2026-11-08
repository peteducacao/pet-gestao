# PET Gestão

Central de organização do PET Educação — Universidade Federal de Sergipe.

Este repositório contém a **interface definitiva do produto**, preparada para integração progressiva com a infraestrutura institucional. Não há cadastros fictícios, credenciais, senhas, destinatários de e-mail ou atividades de exemplo no site. Dados compartilhados **não** são armazenados no navegador.

## Estrutura do site

- **Visão geral:** indicadores, próximos prazos, atualizações e acessos às seções.
- **Demandas:** mensal, semanal, pendentes de qualquer período e arquivo.
- **Cronograma:** mês, ano e semana; navegação manual e atualização automática opcional.
- **Comissões:** estrutura igual para todas, com integrantes vinculáveis, etapas e atividades quando integradas à API.
- **Reuniões e memórias:** memórias originais e demandas associadas, sem duplicação.
- **Minhas pendências:** atividades atribuídas ao usuário autenticado, de todas as comissões.
- **Administração:** entrada bloqueada até existir autenticação, autorização e backend, conforme o escopo aprovado.

## O que está habilitado agora

- Interface responsiva para computador e celular; navegação completa entre páginas públicas.
- Seletores reais de mês, ano e semana; visualização de calendário e período atual.
- Preferências de avanço automático de mês/ano e semana, independentes entre si.
- Consulta manual de qualquer período, sem apagar ou arquivar dados.
- Arquitetura de visualização pronta para registros reais fornecidos por API.
- Tratamento de ausência de dados e erro de conexão sem apresentar contagens falsas.

## O que não está habilitado

**Ainda não há autenticação, banco de dados, cadastro compartilhado, permissões administrativas, extração automatizada das memórias ou envio/agendamento de e-mails.** A interface não simula a conclusão desses processos nem grava atividades localmente. Os controles de escrita permanecem bloqueados.

Isso é intencional: permitir operações compartilhadas antes de configurar autenticação e regras de acesso poderia comprometer dados da equipe.

## Arquivos

- `index.html`: estrutura de navegação e acessibilidade.
- `styles.css`: identidade visual e layout responsivo.
- `app.js`: páginas, filtros, calendário, listas, estados e contrato de leitura da API.
- `config.js`: configuração **pública**, sem segredos; o `apiBaseUrl` ficará vazio até a integração.
- `assets/favicon.svg`: ícone vetorial.
- `docs/CONTRATO-API.md`: especificação para a integração futura.
- `docs/REGRAS-NEGOCIO.md`: regras funcionais aprovadas.

## Executar

Não há dependências de build. Para executar localmente:

```bash
python -m http.server 8000
```

Acesse `http://localhost:8000`.

Para publicação estática, use um provedor de hospedagem de sites estáticos e a raiz do repositório como diretório público. **O repositório no GitHub, sozinho, não significa que o site esteja publicado.** A configuração de hospedagem será realizada em etapa própria.

## Integração de API — fase posterior

Após configurar servidor, banco D1 e autenticação, altere somente a URL **pública** `apiBaseUrl` no arquivo `config.js`. O front-end consulta `GET /api/v1/bootstrap` com `credentials: include`. O backend precisa aplicar autorização antes de retornar informações privadas ou permitir operações.

Os dados esperados são descritos em [`docs/CONTRATO-API.md`](docs/CONTRATO-API.md). **Nunca inclua chaves de API, tokens de e-mail, credenciais do Cloudflare ou segredos no JavaScript público.**

## Validação

Foram previstos testes de navegação, calendário, preferências, bloqueio de Administração, ausência de dados e versão móvel. O sistema só poderá ser considerado operacional para a equipe após teste integrado com identidade, permissões, banco de dados, notificações e um domínio publicado.
