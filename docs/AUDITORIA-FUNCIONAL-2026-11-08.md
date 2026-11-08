# Auditoria funcional — PET Educação

**Data:** 08/11/2026  
**Alvo:** demonstração estática do GitHub Pages (GitHub + armazenamento local do navegador).  
**Natureza da auditoria:** testes automatizados da lógica em ambiente isolado, inspeção de código e verificações de navegação renderizada. **Não equivale a teste visual manual em PC e celular nem a teste integrado com servidor.**

## Resultado por área

| Área | Situação | Verificações / observações |
| --- | --- | --- |
| Página inicial e períodos | Testado em simulação | Seis prazos, semanas, listagens, navegação para cronograma e ausência de bloco Memórias recentes. |
| Demandas | Testado em simulação | Criar, editar, excluir, validar campos, múltiplos responsáveis, vínculos com comissões e não duplicação de registros. |
| Situação da demanda | Testado em simulação | Pendente, Aprovada, Concluída / Arquivada, reabertura, filtros distintos e priorização. |
| Comissões | Testado em simulação | Criar, renomear, editar participantes, excluir, confirmar exclusão e preservar demandas vinculadas a outras comissões. |
| Reuniões / Memórias | Testado em simulação | Criar, editar, excluir, preservar tarefas relacionadas, personalizar cores e verificar renderização textual segura. |
| Prazos | Testado em simulação | Mais de um responsável, horário, alteração da data, salvar seção sem perder outras alterações e restaurar dados. |
| Observações | Testado em simulação | Edição do texto, autoria específica e cópia; alterar apenas situação não modifica autoria do texto. |
| Anexos | Implementado para **demo local**, testado em simulação | Arquivo aceito, rejeição de formatos impróprios, limites de 1 MB/arquivo, 2 MB somados, 6 arquivos, visualizar lista, baixar e excluir. Sem armazenamento na nuvem. |
| Indicadores | Corrigido e testado em simulação | Contagem separada de Pendentes e Aprovadas nas comissões e na visão geral; cores semânticas e grade 2×2 no celular. |
| Dados após atualização da página | Testado em armazenamento simulado | Mesclagem de cadastros, exclusões e edições com os dados-padrão do navegador em que foram criados. |
| Sincronização entre dispositivos | **PENDENTE — não implementado** | Comissões criadas no PC ficam no navegador do PC. Não aparecem no celular; também ocorre com demandas, memórias e anexos. |
| Login, permissões, e-mails | **PENDENTE — não implementado** | A API está vazia e `demoMode: true`. Não há autenticação real, notificações ou programação de e-mails. |
| Teste visual real mobile/desktop | **PENDENTE** | O funcionamento e o layout na página publicada precisam de conferência em navegador real. |

## Correções aplicadas na auditoria

1. Corrigido o manipulador da escolha de responsáveis: antes ignorava cliques nas caixas da lista por verificar `data-field` cedo demais.
2. Separadas as contagens de **Pendentes** e **Aprovadas**, incluindo os indicadores de cada comissão.
3. Colocado o salvamento parcial de prazos sem redesenhar o formulário e apagar textos ainda não salvos.
4. Evitado que uma nova data de prazo mantenha indevidamente a marcação anterior de etapa concluída.
5. Adicionado suporte demonstrativo a anexos locais, com lista, download, remoção, limites e validação de formatos.
6. A edição de observações de atividade aprovada exige nova aprovação explícita, sem reaproveitar automaticamente a anterior.
7. Endereços com codificação inválida passam a ser tratados sem quebrar a navegação.
8. O bloco **Pendências semanais** não inclui demandas aprovadas; essas continuam visíveis em **Cronograma** como ativas.
9. Ajustados os quatro indicadores das comissões com nomes, contagens e cores estáveis, sem depender da ordem.
10. O aviso da demonstração passou a informar claramente que **não há sincronização entre aparelhos**.

## Importante: problema encontrado pelo usuário

**Comissão de Vídeos no PC, ausente no celular.** Isso foi confirmado como uma limitação arquitetural: alterações locais ficam no `localStorage` de cada navegador. O GitHub Pages hospeda arquivos estáticos, não salva cadastros dos PETianos. **O problema ainda não está resolvido.**

Para sincronizar, é necessário implementar uma API autenticada, banco de dados compartilhado e migração dos cadastros locais existentes. **Não limpar os dados do navegador do PC** antes de fazer backup/migração da comissão.

## Limites dos testes

As operações de criar/editar/excluir realizadas pela auditoria usaram cópias isoladas dos dados e armazenamento simulado, não o navegador nem a conta do usuário. Não houve acesso aos dados locais do PC ou do celular. Não foi possível verificar a publicação ao vivo em browser remoto ou a integração com backend, pois essas integrações ainda não existem.

**Critério para considerar o projeto pronto para a equipe:** sincronização real entre dispositivos, autenticação e permissões, armazenamento seguro de anexos, e-mails com confirmação e testes completos em celular/PC reais.
