# Contrato proposto de integração

Este documento prepara a implantação **futura**. Não representa endpoints já existentes.

## Autenticação e segurança

- Sessão autenticada por cookie seguro (`HttpOnly`, `Secure`, `SameSite` adequado) e proteção contra CSRF nas ações de escrita.
- Verificação de permissões no servidor, inclusive quando uma pessoa possui mais de um papel.
- Identidade nunca é aceita somente a partir de parâmetro enviado pelo navegador.
- API com limites de requisição, validação dos payloads, logs de auditoria e proteção contra edição concorrente.
- Caso não autenticado: `401`. Sem permissão: `403`. Falha de validação: `422`.

## Leitura do painel

`GET /api/v1/bootstrap`

Retorna apenas informações autorizadas para a sessão atual, por exemplo:

```json
{
  "session": {
    "user": {"id": "id-do-usuario", "name": "Nome", "roles": ["petiano"]}
  },
  "users": [],
  "committees": [],
  "meetings": [],
  "tasks": [],
  "events": []
}
```

Campos esperados:

| Entidade | Propriedades de leitura |
| --- | --- |
| Usuário | `id`, `name`, `roles` |
| Comissão | `id`, `name`, `memberIds[]` |
| Reunião | `id`, `title`, `date`, `rawNotes`, `taskIds[]`, `theme`, `colorA`, `colorB` |
| Atividade | `id`, `title`, `description`, `committeeId` (compatibilidade), `commissionIds[]`, `meetingId` (opcional/legado), `assigneeIds[]`, `createdAt`, `registeredAt`, `status`, `reviewStatus`, `stageName`, `completedAt`, `deadlines[]`, `observations[]`, `postingAt` (obrigatório) |
| Prazo | `label`, `kind`, `assigneeIds[]`, `assigneeNames[]`, `assigneeId`/`assigneeName` (legado), `dueAt`, `completedAt` |
| Observação | `id`, `body`, `authorId`, `authorName`, `createdAt` |
| Evento | `id`, `summary`, `actorId`, `actorName`, `createdAt` |

As datas são ISO 8601. Prazos com horário devem conter timezone explícito. Para registros cuja data não possui horário, usar `YYYY-MM-DD`. O horário 23:59 é apenas o valor inicial sugerido no formulário de novos prazos; nunca sobrescrever horários cadastrados.

## Operações previstas, ainda não implementadas

- `GET/POST/PATCH/DELETE /api/v1/committees`
- `GET/POST/PATCH/DELETE /api/v1/tasks`
- `GET/POST/PATCH/DELETE /api/v1/meetings`
- `POST /api/v1/meetings/:id/extract-tasks` (revisão obrigatória antes de persistir)
- `GET/POST/PATCH/DELETE /api/v1/users` (restrito à Administração)
- `POST /api/v1/tasks/:id/observations`
- `POST /api/v1/tasks/:id/deadlines`
- `POST /api/v1/email/send`, `POST /api/v1/email/schedule`, `PATCH /api/v1/email/schedules/:id`, `DELETE /api/v1/email/schedules/:id` (restrito)
- `GET/PATCH /api/v1/settings` (conforme cargo)

Os nomes e formatos finais serão validados durante a implementação do backend. Não os considere APIs em produção. O status da demanda é selecionado como Pendente, Concluída ou Aprovada; para compatibilidade com a prévia, Aprovada corresponde a `status=pendente` com `reviewStatus=liberado`. Este mapeamento pode ser simplificado no contrato definitivo.

## Etapas padronizadas

A estrutura de dados é única para todas as comissões. O catálogo global de etapas pode ser editado pela Administração; **Publicar** é uma etapa possível, com `assigneeId` próprio. As tarefas de etapas contam também para as pendências individuais, sem duplicação de tarefa. `reviewStatus=liberado` representa **APROVADO** e pode ser definido por PETianos(as), tutores ou administradores; `status=concluida` é um ato separado que arquiva a atividade.

## Notificações

Gatilhos de tutoria são gerados por eventos autenticados de escrita, não por texto de formulário contendo o nome de uma pessoa. O serviço valida o papel do autor, resolve os responsáveis pela atividade, elimina destinatários repetidos e monta o e-mail com dados de auditoria. O bloco `observacao` só é incluído no template quando houver conteúdo preenchido.

Envio manual da Administração constitui fluxo independente, com editor de conteúdo e fila de agendamento. Jobs idempotentes impedem disparos duplicados quando um trabalho é reprocessado.

## Hospedagem futura

- Front-end estático hospedado em domínio institucional adequado.
- Backend Cloudflare Workers ou serviço equivalente, com armazenamento D1 ou banco equivalente.
- Arquivos enviados em armazenamento privado apropriado e URLs com autorização.
- Serviço de e-mail transacional configurado com domínio verificado, SPF/DKIM e gerenciamento de falhas.
- Rotina agendada executada no servidor, não no navegador do usuário.

## Comissões e prazos — atualização da prévia

A prévia contém criação, edição e exclusão de comissões, com seleção de `memberIds[]`, mas não envia alterações ao servidor. Prazos aceitam múltiplos responsáveis; **Salvar prazos** é uma atualização parcial da atividade existente. No backend deverão existir operações transacionais autenticadas, auditadas e sujeitas a permissões.
