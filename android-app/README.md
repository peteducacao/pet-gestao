# PET Gestão — aplicativo Android (APK)

Este projeto é um contêiner Android WebView para a interface pública em:
https://peteducacao.github.io/pet-gestao/

A interface, o login e o banco de dados continuam sendo os mesmos do site,
com API no Cloudflare Worker e banco Cloudflare D1.

## Atualizações
Mudanças publicadas no GitHub Pages aparecem no aplicativo quando ele
carrega/recarrega o site. O service worker do site controla o cache de arquivos
públicos. Mudanças na parte nativa exigem gerar e instalar outro APK.

## Compilação
Exige JDK 17, Android SDK 35 e Gradle 8.11.1.

```bash
cd android-app
gradle :app:assembleDebug
```

Saída: `app/build/outputs/apk/debug/app-debug.apk`.

O GitHub Actions publica um APK instalável para testes em "Actions" e no
Release com tag `android-apk`. Por padrão é um APK **de desenvolvimento**,
assinado com a chave de debug do ambiente CI, adequado para instalação
manual, não para publicar na Play Store. A assinatura de debug pode mudar
entre execuções: se um futuro APK não atualizar por causa disso, será
necessário desinstalar o anterior (com possível perda de estado local),
ou configurar uma chave de assinatura privada e estável para builds de produção.
Nunca inclua chaves privadas no repositório público.

## Segurança
Não usa JavaScript bridge nem armazenamento privado de arquivos. Permite
somente HTTPS para a WebView hospedada no GitHub Pages; URLs externas são
abertas por aplicativos externos. Não incorpora senhas/tokens no APK.
O APK precisa de internet para sincronizar dados. Backups do banco devem
continuar sendo realizados no sistema original.

## Notificações nativas (Firebase)

- Projeto Firebase: `pet-gestao-yfs`, pacote `br.ufs.peteducacao.gestao`.
- No GitHub Actions, configurar o secret `FIREBASE_GOOGLE_SERVICES_JSON_B64` com o conteúdo Base64 de `google-services.json` (não publicar o JSON).
- No Cloudflare Worker `pet-gestao`, configurar `FCM_SERVICE_ACCOUNT_JSON` como Secret usando uma chave de conta de serviço do mesmo projeto.
- Permissão de notificações necessária a partir do Android 13.
- O dispositivo se vincula à conta autenticada; as preferências ficam em Meu perfil → Notificações no celular.
- **Nota sobre atualização:** builds de debug do GitHub Actions podem ter assinaturas distintas; pode ser necessário desinstalar a versão anterior antes de instalar a nova. Uma versão de produção requer assinatura estável.
- O APK isoladamente não comprova entrega: testar em aparelho real após configurar os dois secrets.
