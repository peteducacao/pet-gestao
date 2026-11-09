# Ativar Gmail no PET Gestão

O **PET Gestão** precisa de um Google Apps Script próprio. O código da ponte está em
`integracoes/AppsScript_PET_Gestao.gs` e não deve ser confundido com o script do Inventário PET.
O script do Inventário usa o próprio token e fluxo de fila, e sua função `doPost`
não é uma API genérica para e-mails manuais de outros sistemas.

1. No Google Apps Script da conta do PET, crie um projeto separado para o Gestão.
2. Cole integralmente `integracoes/AppsScript_PET_Gestao.gs` no editor.
3. Em **Configurações do projeto → Propriedades do script**, crie
   `PET_GESTAO_MAIL_TOKEN` com uma chave aleatória forte de 32 ou mais caracteres.
4. **Implantar → Nova implantação → Aplicativo da Web**. Execute como a conta PET e
   permita acesso a **Qualquer pessoa**. Autorize a permissão de envio do Gmail.
5. Em **GitHub → pet-gestao → Settings → Secrets and variables → Actions**,
   configure `MAIL_BRIDGE_URL` com o endereço `/exec` dessa implantação e
   `MAIL_BRIDGE_TOKEN` com **o mesmo valor secreto** do passo 3.
6. Reexecute a publicação "PET Gestão — publicar aplicação real" para transferir
   os segredos ao Cloudflare Worker.
7. Em **Administração → E-mails → Fila e histórico do Gmail**, clique
   em **Atualizar**. O estado deve ser "Integração Gmail autenticada".
8. Envie uma mensagem a **um endereço autorizado da equipe** e verifique o
   resultado no histórico. "Enviado" significa que a ponte aceitou a solicitação,
   não prova recebimento na caixa de entrada.

Nunca copie os segredos para arquivos do GitHub ou para este chat.

**Atenção:** corrigir apenas o código do Worker não modifica o Apps Script já implantado.
A mudança de URL/chave e a nova implantação são obrigatórias quando aparece
"Não autorizado". Os itens antigos com falha permanecem no histórico; não
use "Tentar novamente" até que o monitor confirme uma integração autenticada.
