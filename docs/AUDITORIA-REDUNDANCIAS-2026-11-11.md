# Auditoria de redundâncias e clareza — PET Gestão

**Data:** 11/11/2026  
**Escopo:** aplicação de interface (`app-live.js`), estilo responsivo (`live.css`), fluxos autenticados e regras funcionais.  
**Status:** pontos abaixo são **propostas para avaliação**. **Nenhum botão ou fluxo foi removido automaticamente** com base nesta auditoria.

## Itens possivelmente redundantes

| Prioridade | Área | Comportamentos observados no código | Proposta para avaliação | Cuidado |
| --- | --- | --- | --- | --- |
| Alta | Conclusão de demandas mistas | O botão **Concluir para todos(as)** e a caixa **Marcar todos** selecionam todas as participações pendentes. | Avaliar um único comando global de seleção e manter caixas individuais. | Não remover as opções de concluir apenas a própria participação nem a confirmação antecipada. |
| Média | Cards de demandas | O card contém um link de cobertura para abrir o detalhe e um segundo link **Ver detalhes** para a mesma rota. | Manter o link visível por acessibilidade/orientação ou substituí-lo por uma indicação discreta. | O card deve continuar acessível por toque/teclado e permitir abrir em nova guia. |
| Média | Navegação de edição | A seta de retorno do cabeçalho e o botão **Voltar** dentro de alguns formulários usam a mesma ação de navegação. | Verificar por tela se uma das duas referências pode ser dispensada. | A ação de voltar não pode descartar edição sem o aviso. |
| Média | Áreas comum e Admin | O menu Admin inclui **Demandas** e a área comum também. Ambas reutilizam a mesma tela, com rotas diferentes. | Avaliar se o menu Admin precisa manter esse atalho ou pode redirecionar à área comum. | Não eliminar o acesso às demandas nem alterar as permissões. |
| Baixa | Ações rápidas do Admin | **Nova demanda** e **Registrar demanda** (na própria página Demandas) abrem o cadastro comum. | Manter como atalho contextual ou simplificar se a navegação ficar excessiva. | Atalhos são úteis em telas diferentes e não duplicam registros. |
| Baixa | Admin → E-mails | O bloco de **Fila e histórico do Gmail** mostra status resumidos; **Acompanhar envios** abre a visão detalhada dos mesmos registros. | Avaliar se o resumo deve permanecer como prévia, com o botão de detalhes. | Não perder controle de falhas, reenviar, cancelamento e acompanhamento da integração. |

## Controles que precisam de melhor explicação

1. **Pendentes x Atrasadas** — pendente não concluída sem prazo vencido; atrasada não concluída com prazo vencido. A Ajuda em Comissões esclarece a diferença.
2. **Concluir participação de comissão x concluir demanda inteira** — comissões e pessoas são participações independentes. Arquivar só quando todas concluírem. A Ajuda em Comissões esclarece.
3. **Salvar e enviar x Salvar sem enviar** — ambas salvam a demanda; somente a primeira solicita notificação. A pergunta deve manter este texto.
4. **Limpar tudo nas últimas atualizações** — esconde somente os eventos anteriores para a conta atual; não elimina os históricos institucionais.
5. **Voltar ao PET Gestão** — troca da visualização Admin para a área comum sem fazer logout. O popup de transição deve comunicar isso.

## Funcionalidades que parecem parecidas, mas devem permanecer distintas

- **Minhas pendências x Demandas** — uma é pessoal e considera comissões da pessoa; a outra é o acompanhamento geral da equipe.
- **Uma pessoa responsável x uma comissão** — participações diferentes e independentes.
- **Modelos de criação/revisão x modelos de prazo** — possuem disparadores, permissões e públicos diferentes.
- **Excluir uma demanda x excluir demandas em lote** — a primeira atua no detalhe; a segunda seleciona várias concluídas.
- **Visualização mensal/semanal x seletores mês/ano/semana** — o primeiro define a granularidade de apresentação; os demais delimitam o período.

## Decisões pendentes

- [ ] Decidir se mantém **Concluir para todos(as)** além de **Marcar todos**.
- [ ] Decidir se o link **Ver detalhes** permanece quando o card inteiro é clicável.
- [ ] Avaliar, em celular e computador, a duplicidade de **Voltar** em edição.
- [ ] Avaliar a necessidade de acesso a Demandas dentro do menu Admin.
- [ ] Decidir se mantém ações rápidas como atalhos.
- [ ] Avaliar resumo + modal de envios do Gmail.

**Regra:** não eliminar ou fundir um desses controles sem aprovação da equipe; mudanças exigem testes de navegação, acessibilidade, autorização e preservação de dados.
