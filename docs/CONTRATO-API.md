# Contrato API PET Gestão (v1)

Base: Worker pet-gestao, URLs com prefixo /api/v1. Respostas JSON. Erros com HTTP apropriado e formato {"error":"mensagem"}; nunca retornar segredos. Na interface hospedada pelo GitHub Pages, enviar cabeçalho Authorization: Bearer TOKEN após login. Somente as informações de visualização pública são retornadas sem token. O token fica na sessionStorage do navegador.

## Públicas
| Método | Rota | Entrada / resultado |
|---|---|---|
| GET | /health | ok, service, database, now |
| GET | /bootstrap | comissões, resumos de demandas, sessões e dados autorizados |
| POST | /auth/register | name, email, password; cadastra PETiano(a) |
| POST | /auth/login | email, password; retorna token e user |
| POST | /auth/forgot | email; mensagem genérica, envio de link se cadastrado |
| POST | /auth/reset | token, password; link válido por 30 minutos e uma vez |

## Autenticadas
| Método | Rota | Entrada / resultado |
|---|---|---|
| GET | /auth/me | dados da conta atual |
| POST | /auth/logout | revoga sessão |
| POST | /auth/change-password | password, newPassword; revoga outras sessões |
| PATCH | /account | notificationEnabled |
| POST | /commissions | name, description, backgroundColor, imageData |
| PUT | /commissions/:id | edita comissão; apenas Admin muda maxMembers |
| POST | /commissions/:id/join | inscreve a pessoa, respeitando vagas |
| POST | /commissions/:id/leave | sai da comissão |
| POST | /tasks | title, description, captionText, assigneeIds[], commissionIds[], deadlines[], notify |
| PUT | /tasks/:id | mesmos campos; controle de versão |
| PATCH | /tasks/:id/notes | captionText, notify |
| PATCH | /tasks/:id/status | status = pendente/aprovada, notify |
| PATCH | /tasks/:id/finish | commissionId, early, notify |
| DELETE | /tasks/:id | só demanda arquivada; exclusão definitiva |
| POST | /meetings | title, date, rawNotes, theme, colorA, colorB |
| PUT | /meetings/:id | atualiza a memória |
| DELETE | /meetings/:id | exclui memória, não apaga demandas |

Campo deadlines[]: cada elemento tem id, label (Prazo, Correção, Postagem), dueAt (YYYY-MM-DDTHH:mm:ss), assigneeIds[]. Pelo menos uma etapa Prazo com data. commissionDone armazena a conclusão independente de cada comissão, com autoria/hora. O sistema exige confirmação no front-end quando uma conclusão for antecipada, e o Worker registra a escolha explicitamente no campo early.

## Exclusivas da Administração
| Método | Rota | Entrada |
|---|---|---|
| GET | /admin/users | listagem de contas, cargos e preferências |
| PATCH | /admin/users/:id | name, role, notificationEnabled |
| POST | /admin/users/:id/temporary-password | retorna temporaryPassword **uma vez** |
| PUT | /admin/settings | autoMonth, autoWeek |
| PUT | /admin/commission-order | ids[] na ordem desejada |
| DELETE | /commissions/:id | exclui comissão sem demandas vinculadas |
| GET | /mail | fila e histórico (últimos 250 registros) |
| POST | /mail | all, userIds[], committeeIds[], subject, message, scheduledAt (opcional), attachments[] somente imediato |
| POST | /mail/clear | limpa status enviado/falhou, preserva pendentes |
| POST | /mail/retry | id de envio com falha (sem reenvio de anexos que não foram armazenados) |

Anexo manual: objeto com nome, mimeType e base64. Limite de 10 MB por arquivo e limite conservador total de 14 MB. E-mails agendados **não** permitem anexos.

## Privacidade / permissões
O Worker aplica validações, credenciais e papéis a cada operação. Requisições HTTP sem token não são autorizadas a alterar nada, mesmo que o usuário manipule o HTML. Conteúdo completo de demandas, e-mails e históricos só aparece em bootstrap autenticado. Senha, salt e tokens nunca são retornados.
