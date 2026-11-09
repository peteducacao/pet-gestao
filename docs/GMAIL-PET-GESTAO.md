# Ativar Gmail no PET Gestão

O **PET Gestão** precisa de um Google Apps Script próprio. O código da ponte está em
`integracoes/AppsScript_PET_Gestao.gs` e não deve ser confundido com o script do Inventário PET.
O script do Inventário usa o próprio token e fluxo de fila, e sua função `doPost`
não é uma API genérica para e-mails manuais de outros sistemas.

1. No Google Apps Script da conta do PET, crie um projeto separado para o Gestão.
2. Cole integralmente `integracoes/AppsScript_PET_Gestao.gs` no editor.
3. No seletor de funções do Apps Script, escolha **`gerarTokenPETGestao`** e clique em
   **Executar**. Conceda a autorização solicitada pelo Google. A função gera a chave
   e a salva automaticamente como `PET_GESTAO_MAIL_TOKEN` nas propriedades do script.
   **Não precisa criar a propriedade manualmente**.
4. Abra o **Registro de execução** e copie o token gerado. Se a chave já existia,
   a função mostra a mesma chave para evitar desencontro com o Worker.
5. Em **Implantar → Nova implantação → Aplicativo da Web**, selecione **Executar como: eu**
   (conta PET), acesso **Qualquer pessoa**, e autorize o envio de e-mails.
   Copie a URL da implantação que termina em **`/exec`**. Se já havia uma implantação,
   publique uma **nova versão** para atualizar o código servido.
6. Em **GitHub → peteducacao/pet-gestao → Settings → Secrets and variables → Actions**,
   atualize os dois segredos:
   - `MAIL_BRIDGE_TOKEN` = o token do **Registro de execução** do passo 4.
   - `MAIL_BRIDGE_URL` = a URL `/exec` da implantação do **PET Gestão** do passo 5.
7. Execute novamente **PET Gestão — publicar aplicação real** em **Actions** para que
   os segredos atualizados sejam transferidos ao Cloudflare Worker.
8. Em **Administração → E-mails → Fila e histórico do Gmail**, clique
   em **Atualizar**. O estado deve ser "Integração Gmail autenticada".
9. Envie uma mensagem a **um endereço autorizado da equipe** e verifique o
   resultado no histórico. "Enviado" significa que a ponte aceitou a solicitação,
   não prova recebimento na caixa de entrada.

Nunca copie os segredos para arquivos do GitHub ou para este chat.

**Atenção:** corrigir apenas o código do Worker não modifica o Apps Script já implantado.
A mudança de URL/chave e a nova implantação são obrigatórias quando aparece
"Não autorizado". Os itens antigos com falha permanecem no histórico; não
use "Tentar novamente" até que o monitor confirme uma integração autenticada.
