# FLOW — Regras Oficiais do Projeto

Este arquivo é o documento oficial de regras, arquitetura, produto, UX/UI, segurança, permissões e padrões de desenvolvimento do projeto.

O projeto se chama **FLOW**.

**IMPORTANTE:**

- O FLOW **NÃO** deve ser tratado apenas como um launcher.
- O FLOW é uma plataforma interna de gestão e operações da empresa.
- O launcher é o aplicativo/interface principal de acesso ao sistema.
- O sistema deve centralizar informações que hoje estão espalhadas em sistemas/bancos existentes.
- Existe um sistema já funcional responsável pelo gerenciamento de cartões realizados pelos funcionários.
- Esse sistema existente já possui registros de cartões e registros relacionados a gerentes.
- O FLOW deverá consumir e integrar esses dados existentes.
- **NÃO** criar um banco paralelo para duplicar dados que já existem sem necessidade.
- **NÃO** inventar tabelas, colunas, endpoints ou estruturas de banco que não tenham sido confirmadas.
- Antes de alterar ou criar integrações, analisar a estrutura existente do projeto e do banco.
- O FLOW deve funcionar como uma camada central de gestão sobre os dados existentes, adicionando recursos administrativos, operacionais, métricas, metas, relatórios e gestão de funcionários.

Qualquer agente de IA que trabalhar neste projeto deve ler este `rules.md` **antes** de modificar o projeto.

---

## 1. Visão do produto

O FLOW é uma Central de Gestão e Operações.

Objetivo: centralizar em uma única aplicação:

- funcionários;
- cartões;
- metas;
- desempenho;
- projeções;
- vales;
- lojas;
- escalas;
- observações internas;
- relatórios;
- avisos;
- permissões;
- auditoria;
- indicadores da operação.

O sistema deve permitir que gestores tenham uma visão completa da operação sem precisar acessar diversos sistemas diferentes.

O FLOW deve priorizar:

- simplicidade;
- velocidade;
- organização;
- segurança;
- clareza;
- dados confiáveis;
- rastreabilidade;
- experiência premium;
- interface moderna;
- facilidade para gestores.

O produto deve parecer um software empresarial profissional, e não um sistema administrativo antigo.

---

## 2. Princípio central

O FLOW deve seguir o conceito:

> Todos os dados importantes da operação em um só lugar.

O sistema deve conectar:

```text
FUNCIONÁRIO
      ↓
CARTÕES
      ↓
METAS
      ↓
DESEMPENHO
      ↓
PROJEÇÃO
      ↓
RELATÓRIOS
      ↓
DASHBOARD
```

Além disso:

```text
FUNCIONÁRIO
      ↓
VALES
      ↓
ESCALA
      ↓
OCORRÊNCIAS
      ↓
OBSERVAÇÕES
      ↓
HISTÓRICO
```

Todos esses dados devem estar relacionados quando tecnicamente aplicável.

---

## 3. Módulos principais

O FLOW deverá possuir os seguintes módulos principais:

1. Dashboard
2. Funcionários
3. Cartões
4. Vales
5. Lojas
6. Escalas
7. Observações internas
8. Relatórios
9. Central de avisos
10. Permissões
11. Auditoria
12. Metas
13. Ocorrências
14. Documentos
15. Configurações

Os módulos podem crescer futuramente, mas essa estrutura deve ser considerada a base do produto.

---

## 4. Dashboard

O Dashboard será a visão geral da operação.

Deve apresentar informações relevantes de forma rápida.

Exemplos de indicadores:

- total de funcionários;
- funcionários ativos;
- funcionários inativos;
- quantidade de lojas;
- cartões realizados;
- cartões esperados;
- percentual de atingimento;
- projeção de cartões;
- funcionários acima da meta;
- funcionários abaixo da meta;
- vales pendentes;
- vales pagos;
- atividades recentes;
- avisos recentes;
- alertas administrativos.

O Dashboard deve permitir filtros por:

- período;
- loja;
- funcionário;
- cargo;
- status;
- outros filtros relevantes.

O Dashboard deve destacar situações que exigem atenção.

Exemplos:

- "12 funcionários estão abaixo da projeção da meta."
- "Loja 03 está 18% abaixo da meta."
- "R$ 2.450,00 em vales pendentes."
- "87% da meta da rede foi atingida."

O Dashboard deve ser orientado à tomada de decisão.

---

## 5. Funcionários

O módulo Funcionários será um dos módulos centrais do FLOW.

Deve permitir:

- visualizar funcionários;
- pesquisar funcionários;
- filtrar funcionários;
- cadastrar funcionários quando permitido;
- editar informações quando permitido;
- ativar/desativar funcionários quando permitido;
- visualizar loja;
- visualizar cargo;
- visualizar informações administrativas;
- visualizar desempenho;
- visualizar cartões;
- visualizar metas;
- visualizar projeções;
- visualizar vales;
- visualizar escala;
- visualizar ocorrências;
- visualizar observações internas;
- visualizar histórico;
- visualizar documentos quando permitido.

Cada funcionário deve possuir uma página/perfil completo.

---

## 6. Perfil do funcionário

O perfil do funcionário deve ser tratado como um "mini centro de gestão".

Exemplo conceitual:

```text
Maria Oliveira
Operadora de Caixa
Loja 03
Status: Ativa
```

### Resumo

- Cartões realizados: 82
- Meta: 100
- Faltantes: 18
- Atingimento: 82%
- Média diária: 4,1
- Projeção: 123
- Status: Acima da projeção

### Desempenho

Exibir gráficos e indicadores de:

- cartões realizados;
- meta;
- progresso;
- média;
- projeção;
- evolução ao longo do tempo.

### Cartões

Mostrar os dados provenientes do sistema existente.

Exemplos:

- total histórico;
- total do mês;
- total da semana;
- total do dia;
- histórico por data;
- evolução;
- comparação com meta.

O FLOW deve aproveitar os registros existentes de cartões.

Não duplicar manualmente esses dados.

### Metas

O perfil deve apresentar:

- meta diária;
- meta semanal;
- meta mensal;
- meta do período;
- realizado;
- faltante;
- percentual atingido;
- média necessária;
- projeção;
- status da meta.

As metas precisam ser configuráveis de acordo com as regras do negócio.

### Vales

Mostrar:

- vales de domingo;
- valores;
- períodos;
- status;
- pagamentos;
- histórico.

### Escala

Mostrar:

- dias trabalhados;
- horários;
- folgas;
- alterações;
- histórico de escala.

### Observações internas

Mostrar somente para usuários autorizados.

Cada observação deve possuir:

- data;
- autor;
- conteúdo;
- nível de visibilidade;
- histórico de alterações quando aplicável.

### Ocorrências

Permitir registrar ocorrências administrativas/operacionais quando permitido.

Exemplos:

- atraso;
- falta;
- ocorrência operacional;
- advertência;
- elogio;
- reconhecimento;
- outros eventos administrativos.

### Histórico

Exibir uma timeline consolidada do funcionário.

Exemplo:

```text
14/09/2026
Vale de domingo lançado
R$ 50,00

14/09/2026
Nova observação adicionada

13/09/2026
5 cartões registrados

10/09/2026
Alteração de escala
```

O histórico deve ser baseado em dados reais e eventos registrados.

---

## 7. Métricas e desempenho

O FLOW deve possuir um sistema de métricas.

Para cada funcionário, quando houver dados suficientes, calcular:

- quantidade realizada;
- quantidade esperada;
- meta;
- percentual de atingimento;
- quantidade faltante;
- média diária;
- média semanal;
- média mensal;
- projeção;
- diferença para a meta;
- tendência;
- evolução comparativa.

Exemplo:

- Meta mensal: 100
- Realizado: 82
- Faltante: 18
- Atingimento: 82%
- Média diária: 4,1
- Dias restantes: 10
- Projeção: 123

O cálculo deve considerar somente dados válidos.

**NUNCA** apresentar uma projeção como certeza.

A projeção deve ser claramente identificada como estimativa.

---

## 8. Projeção de meta

A projeção deve considerar o contexto real da operação.

Dependendo das regras disponíveis, considerar:

- quantidade de dias trabalhados;
- dias restantes;
- folgas;
- escala;
- feriados quando aplicável;
- média atual;
- período selecionado.

Exemplo conceitual:

```text
realizado + (média diária × dias restantes)
```

Essa fórmula **não** deve ser implementada cegamente.

Antes de definir o cálculo definitivo, verificar as regras reais do negócio.

A projeção deve ser configurável.

---

## 9. Comparação de períodos

O FLOW deve permitir comparar desempenho.

Exemplos:

- Setembro: 82 cartões
- Agosto: 94 cartões
- Julho: 76 cartões

Mostrar:

- evolução;
- variação percentual;
- diferença absoluta;
- tendência.

Também permitir comparação:

- funcionário x funcionário;
- funcionário x loja;
- funcionário x média da equipe;
- loja x loja;
- período x período.

Sempre respeitando as permissões do usuário.

---

## 10. Ranking

Criar ranking de desempenho quando aplicável.

Exemplo:

1. João — 142%
2. Beatriz — 137%
3. Carlos — 129%

Filtros:

- loja;
- período;
- cargo;
- equipe;
- métrica.

O ranking deve ser baseado em dados reais.

Não criar ranking usando dados fictícios em produção.

---

## 11. Cartões

O módulo Cartões deve integrar-se ao sistema existente.

O FLOW deve conseguir consultar os registros já existentes.

Possíveis informações:

- funcionário;
- quantidade;
- data;
- período;
- loja;
- status;
- identificador existente;
- outras informações disponíveis.

O FLOW **não** deve assumir que os campos possuem nomes específicos.

Primeiro analisar a estrutura existente.

O sistema existente é a fonte oficial dos dados de cartões, salvo decisão explícita de arquitetura em contrário.

---

## 12. Vales

O módulo Vales deve permitir gerenciar principalmente o vale de domingo.

Informações possíveis:

- funcionário;
- loja;
- período;
- valor;
- status;
- data de lançamento;
- data de pagamento;
- responsável;
- observação.

Status possíveis:

- pendente;
- pago;
- cancelado;
- outros estados definidos pelo negócio.

Deve possuir:

- filtros;
- pesquisa;
- histórico;
- totais;
- relatórios;
- exportação quando implementada.

---

## 13. Lojas

O módulo Lojas deve centralizar as unidades da empresa.

Cada loja pode possuir:

- nome;
- identificador;
- endereço quando aplicável;
- status;
- funcionários;
- gerentes;
- metas;
- desempenho;
- cartões;
- vales;
- escalas;
- indicadores.

A loja deve ser uma entidade importante para filtros e permissões.

Um gerente pode, por exemplo, visualizar apenas as lojas às quais possui acesso.

---

## 14. Escalas

O módulo Escalas deve permitir:

- visualizar escala;
- criar escala;
- editar escala;
- visualizar folgas;
- visualizar horários;
- visualizar funcionários;
- visualizar por loja;
- visualizar por período;
- acompanhar alterações.

Quando possível, os dados da escala devem alimentar corretamente os cálculos de desempenho e projeção.

---

## 15. Observações internas

Observações internas são informações administrativas restritas.

Elas **NÃO** devem ser públicas para todos os funcionários.

Devem existir níveis de acesso.

Exemplo:

- somente administrador;
- gerência;
- gerência da loja;
- usuários autorizados.

Toda criação ou alteração de observação deve possuir rastreabilidade.

Não permitir que usuários sem permissão visualizem conteúdo restrito através da interface **OU** diretamente pela API.

A segurança deve ser aplicada no backend.

---

## 16. Relatórios

O FLOW deve possuir um módulo de Relatórios.

Relatórios possíveis:

- relatório geral da rede;
- relatório por loja;
- relatório por funcionário;
- relatório de cartões;
- relatório de metas;
- relatório de desempenho;
- relatório de vales;
- relatório de escalas;
- relatório de ocorrências;
- relatório de atividades;
- relatório de auditoria.

Relatório individual do funcionário deve poder mostrar:

- informações básicas;
- cartões realizados;
- meta;
- percentual;
- projeção;
- evolução;
- histórico;
- vales;
- ocorrências;
- observações, apenas quando autorizado.

Quando possível, permitir:

- exportação PDF;
- Excel;
- CSV;
- impressão.

---

## 17. Central de avisos

Criar uma Central de Avisos.

Gerentes/autorizados podem criar comunicados.

Exemplos:

- aviso geral;
- aviso de loja;
- aviso para equipe;
- aviso administrativo;
- mudança de procedimento;
- reunião;
- comunicado importante.

Avisos devem poder possuir:

- título;
- conteúdo;
- autor;
- data;
- destinatários;
- loja;
- prioridade;
- status;
- data de expiração quando necessário.

---

## 18. Permissões

O FLOW deve possuir controle de acesso baseado em funções e permissões.

Perfis de cargo:

- Operador — sem login no launcher
- Estoquista — sem login no launcher
- Lider de Operação — acesso total ao painel (todas as unidades) e entra na escala como operador
- Lider de Estoque
- Lider de Caixa
- Gerente
- Gerente Geral
- Supervisor
- Diretor

Operador e Estoquista existem para gestão e visualização pelos cargos acima. Eles não acessam o launcher.

Os demais cargos de gestão têm o mesmo acesso ao sistema.

As permissões devem ser granulares.

Exemplos:

```text
employees.view
employees.create
employees.update
employees.delete

cards.view
cards.manage

goals.view
goals.manage

vouchers.view
vouchers.manage

stores.view
stores.manage

schedules.view
schedules.manage

internal_notes.view
internal_notes.create
internal_notes.update

reports.view
reports.export

announcements.view
announcements.create

audit.view
```

**IMPORTANTE:**

Não confiar apenas na interface para segurança.

Toda permissão deve ser validada no backend/API.

---

## 19. Auditoria

Toda ação sensível deve gerar registro de auditoria.

Exemplos:

- login;
- logout quando necessário;
- criação;
- alteração;
- exclusão;
- alteração de valor;
- alteração de meta;
- alteração de funcionário;
- alteração de permissão;
- criação de observação;
- alteração de vale;
- alteração de escala;
- bloqueio/desbloqueio;
- alterações administrativas.

Registro conceitual:

```text
Usuário: Murilo
Data: 14/09/2026 19:32
Ação: Alterou vale
Funcionário: Maria Oliveira
Antes: R$ 0,00
Depois: R$ 50,00
```

A auditoria deve ser imutável para usuários comuns.

---

## 20. Segurança

Segurança é prioridade.

**NUNCA:**

- colocar credenciais do banco no frontend;
- conectar diretamente o Electron ao banco de produção sem uma arquitetura segura;
- expor senha;
- expor tokens;
- expor secrets;
- confiar apenas em permissões do frontend;
- retornar dados sensíveis sem autorização.

Arquitetura preferencial:

```text
FLOW CLIENT
      ↓
API / BACKEND
      ↓
DATABASE / SISTEMAS EXISTENTES
```

O frontend/launcher não deve possuir acesso direto às credenciais do banco de produção.

---

## 21. Integração com sistemas existentes

Antes de implementar integrações:

1. analisar o projeto existente;
2. analisar banco;
3. identificar tabelas;
4. identificar relações;
5. identificar APIs existentes;
6. identificar autenticação;
7. identificar registros de cartões;
8. identificar registros de gerentes;
9. entender regras existentes;
10. somente então implementar.

**NÃO** inventar estrutura.

Quando uma informação não estiver disponível:

- não inventar;
- não criar mock permanente;
- sinalizar claramente;
- propor a estrutura necessária;
- aguardar definição quando a decisão for crítica.

Mocks podem existir apenas durante desenvolvimento/prototipagem e devem ser claramente separados dos dados reais.

---

## 22. Banco de dados

O banco existente deve ser tratado com cuidado.

Não alterar tabelas existentes sem entender seu impacto.

Não remover campos.

Não renomear tabelas.

Não apagar dados.

Não alterar regras existentes sem solicitação explícita.

Quando for necessário criar novas entidades para o FLOW, documentar:

- tabela;
- finalidade;
- relacionamento;
- campos;
- índices;
- constraints;
- permissões;
- auditoria.

Preferir relações consistentes e integridade referencial.

### Integração Card+

O Card+ já existe em outro Supabase. FLOW não duplica cartões, metas, lojas ou o cadastro operacional.

Tabelas lidas no Card+ (somente as confirmadas no projeto `teSTeSTE`):

- `stores` — unidades (`id`, `name`, `created_at`, `updated_at`)
- `collaborators` — funcionários da loja (nome, `sub_role`, `store_id`, status). `sub_role` confirmado ao vivo: `Funcionario Operacional`, `Caixa`, `Lider de Caixa`, `Vendedor`, `Gerente`. Não há `Gerente Regional` nem `TI` nessa coluna.
- `records` — um cartão por linha: `amount_in_cents` (limite), `amount_used_in_cents` (gasto), `activated`, `activated_later`
- `digitacoes` — `quantity` por lançamento; soma = digitações do período
- `daily_metrics` — `total_customers` (fluxo de clientes), `total_trocas`, `total_caixa`, `date_key`. Sem coluna de PU nem last year.
- `app_users` — contas do Card+ (`username`, `password_hash` bcrypt, `role`, `name`, `store_id`, `is_active`, `is_primary`). Sem coluna `collaborator_id`. `role` confirmado ao vivo: `EMPLOYEE`, `MANAGER`, `REGIONAL_MANAGER`, `TI_ADMIN`, `GLOBAL_ADMIN`. `REGIONAL_MANAGER` = Gerente regional; `TI_ADMIN` = TI (Dev). Essas duas contas são globais da rede: `store_id` pode ser null ou de uma loja qualquer — o FLOW não as trata como vinculadas a uma unidade.
- `dev_users` — login interno do Card+ (`username`, `role` `TI_ADMIN`). Não é a lista de Funcionários do FLOW.
- `daily_goals` — metas; `date_key` `YYYY-MM-DD` = meta do dia de **cartões**; `month-cards:YYYY-MM` = meta mensal de cartões; `month-sales:YYYY-MM` = meta mensal de valor (centavos); `daily-sale:YYYY-MM-DD` = venda do dia registrada (centavos). Confirmado ao vivo: não há prefixo de meta diária de valor, last year nem PU.
- `viradas_pu` — log por colaborador (`store_id`, `collaborator_id`, `date_key`). Não é o PU digitado na mesa financeira.

Cadastro de unidade no FLOW: grava `stores.name` no Card+, cria colaborador `CAIXA` se faltar, e cria `app_users` EMPLOYEE (login/senha dos operadores). A senha nunca volta para o renderer.

Aproveitamento = cartões / (digitações + cartões) da unidade e do mês. Tx. aprovação = cartões / digitações. Clientes do mês = soma de `daily_metrics.total_customers` de todos os dias do mês na unidade filtrada. Digitações = soma de `digitacoes.quantity` no mês da unidade. Linhas sem `store_id` não entram no recorte da loja. Ritmo = cartões que faltam para a meta do mês / dias úteis restantes (a partir de hoje, sem domingo, incluindo hoje), arredondado.

Um cargo por pessoa: a coluna Cargo e o menu usam só o cargo FLOW (`flow_employee_identities` + `flow_profiles`). A função operacional (`collaborators.sub_role`) grava e volta do Card+ quando o Supervisor/Diretor/Lider de Operação edita no FLOW. `app_users.role` `TI_ADMIN` / `REGIONAL_MANAGER` é conta da rede — aparece como selo, nunca como cargo. TI no FLOW vira `LIDER_OPERACAO` (painel inteiro + Time operacional). Sem colaborador na loja, a edição cria um com `Funcionario Operacional`. A conta TI do Card+ não é apagada. Cadastro de Gerente ou Gerente Geral cria login `app_users` `MANAGER`. SQL do Murilo: `0010_flow_murilo_lider_operacao.sql` no FLOW e `cardplus_0010_murilo_operacional.sql` no Card+.

Financeiro replica a mesa de Cartões: todos os dias do mês, clique no dia para registrar. A venda do dia continua em `daily_goals` com `date_key` `daily-sale:YYYY-MM-DD` (centavos), recortada pela unidade. Meta do dia, last year e PU **não existem** no Card+ — ficam na tabela FLOW `flow_finance_days` (`cardplus_store_id`, `date_key` `YYYY-MM-DD`, `goal_cents`, `last_year_cents`, `pu`). SQL: `supabase/migrations/0007_flow_finance_days.sql`. Média do PU do mês = média dos dias que têm PU preenchido (zero explícito entra; dia vazio não puxa a média). Exibição do PU no mesmo padrão de aproveitamento (`30%`), com hint de mix de peças no caixa.

A conexão Card+ fica no processo principal do Electron (`CARDPLUS_*` no `.env.local`). O renderer nunca recebe a service role.

### Entidade nova do FLOW

Tabela: `public.flow_employee_identities`

- Finalidade: CPF e cargo FLOW do funcionário. O Card+ não tem CPF.
- Relacionamento: `cardplus_collaborator_id` = `collaborators.id` do Card+. Sem FK física (bancos diferentes).
- Campos: `cpf_digits` (11 dígitos ou null), `flow_role`, timestamps.
- Índice unique em `cardplus_collaborator_id` e unique parcial em `cpf_digits`.
- RLS: anon bloqueado; authenticated só lê. Escrita pelo main process (service_role).
- Auditoria: `flow_audit_logs` com ação `employee.identity.upsert`.

Projeção do perfil do funcionário: `(cartões do mês / dia atual) * dias do mês`. É estimativa do FLOW, não um campo do Card+.

Escopo por unidade: Supervisor, Diretor e Lider de Operação veem todas as lojas, com filtro no launcher. A última unidade escolhida é gravada no launcher e volta no próximo start. Conta de loja sem unidade não abre sidebar nem dados: tela central pedindo vínculo em Usuários.

Aba Usuários: cria e edita acessos do launcher (`auth.users` + `flow_profiles`). E-mail, senha, cargo FLOW e unidade. Separado do login do Card+. Só Lider de Operação, Supervisor e Diretor gerenciam.

Cargo novo do FLOW: `AUXILIAR` (sem login). Não altera o `sub_role` do Card+.

Exclusão de funcionário: cartões do Card+ vão para o colaborador `CAIXA` da mesma loja; em seguida o colaborador é removido no Card+ e a identidade/vale no FLOW.

Tabela `flow_employee_vouchers`: vale-almoço e vale-transporte em centavos, status `PENDENTE`/`PAGO`. Todo domingo 00:00 (America/Sao_Paulo) o status PAGO volta para PENDENTE. Os valores permanecem.

Tabela `flow_store_profiles`: código interno, observação e flag de atenção da unidade. O Card+ `stores` só tem `id`, `name`, `created_at`, `updated_at` — FLOW não inventa coluna lá.

Tabela `flow_store_leadership`: assentos `GERENTE` (vários), `GERENTE_GERAL`, `SUPERVISOR` e `LIDER_OPERACAO` (um de cada) por `cardplus_store_id`. O uuid em `cardplus_collaborator_id` é `collaborators.id` quando houver vínculo por nome; para Gerente Regional / TI só em `app_users`, é o id dessa conta. Sem FK física. Cadastro/renomeio da loja escreve só `name` no Card+. Auditoria `store.create` / `store.update`.

Tabela `flow_finance_days`: meta diária de valor, last year e PU por unidade/data. Sem coluna nova no Card+. Venda do dia permanece em `daily-sale`. Auditoria `finance.day.upsert`. SQL: `supabase/migrations/0007_flow_finance_days.sql` no **Supabase do FLOW** (não no Card+). Se a tabela ainda não existir, o backend não quebra: PU/meta/last year ficam `null` (não lançado) e o erro de tabela ausente só aparece quando o `select` realmente falha.

Escalas: tabela no FLOW (`0009_flow_schedules.sql`). Horários padrão no SQL (seg–qui abertura 8:20–16 / inter 10:10–19 / fechamento 12:25–21; sexta e sábado com ABT1/ABT2 e FECH1/FECH2). Cada cargo (Operação, Caixa, Auxiliar, Vendedor, Estoquista) tem a própria grade de horários; editar na aba do cargo não muda as outras. Atribuições usam `collaborators.id` do Card+. Gerente / Gerente Geral / Supervisor / Diretor não entram no pool. TI da rede logado no FLOW vira Funcionario Operacional da loja aberta (cria o colaborador se faltar) e entra no Time operacional, inclusive no fim de semana. Lider de Operação tem o mesmo acesso de Supervisor/Diretor no painel. Semana nova copia a anterior automaticamente na primeira abertura. Exportação PNG dark por time para o grupo do Zap. Sem tabela nova no Card+.

Atestados e Equipe: aba ao lado de Escalas. Mesa no mesmo esquema de Cartões/Financeiro (lista do mês, clique no dia). Quadro numérico **do dia** (`flow_attendance_days`: uma linha por loja/data com OP DE LOJA / VENDEDORES / CAIXA / ESTOQUISTA / AUXILIAR DE LIMPEZA). Ocorrência por colaborador e dia (`flow_attendance_events`: ATESTADO, FALTA, FALTA_JUSTIFICADA, BANCO_HORAS). Na Escala, o chip já encaixado mostra só uma bolinha colorida à direita do horário: azul (Atestado), vermelho (Falta / Falta justificada) ou amarelo (Banco de horas). Tooltip = nome do tipo. SQL: `0012_flow_attendance.sql`; se o 0012 antigo (`flow_team_headcount` global) já rodou, `0013_flow_attendance_daily_headcount.sql`. Sem tabela nova no Card+.

Tabela `flow_card_total_overrides`: total mensal **exibido** de cartões por unidade (`cardplus_store_id` + `month_key` `YYYY-MM`). Overlay de UI; não apaga `records` do Card+ nem a tabela diária. Quem edita mesa da loja grava o total correto em Cartões → Opções → Invalidar cartões. Sem override, o FLOW mostra a soma lançada. SQL: `0014_flow_card_total_override.sql` no FLOW.

Kobbi: copiloto operacional no launcher. A chave OpenAI (`OPENAI_*`) fica só no processo principal. O recorte JSON é o painel completo no filtro da loja: cadastros/unidades (liderança, código, atenção), equipe (incluindo Gerente Regional e TI globais), acessos do Card+ sem senha, financeiro do mês (venda, meta do dia, last year, PU por dia, `puOntem` / `puHoje` / `puMediaMes`), cartões registrados (cliente, operador, limite, gasto, status), clientes, ranking, vales, **escala da semana da unidade** (horário por pessoa e dia, match por nome) e ocorrências de `flow_attendance_events` (atestado, falta, falta justificada, banco de horas). O modelo **não** pode dizer que não tem acesso a escalas ou RH. PU = produto único / mix de peças no caixa, lançado no Financeiro FLOW. `null` no recorte = não lançado; o modelo não deve dizer que o KPI “não existe neste recorte” se o campo estiver no JSON. Gráfico mini só quando a pergunta for visual; as séries vêm dos números reais, não do modelo. Histórico: últimas 5 conversas por usuário FLOW em `flow_kobbi_threads` (SQL `0008_flow_kobbi.sql`); o dock reabre vazio no restart e o histórico é manual. Avaliação: Copiar + Avaliar (boa/ruim) em `flow_kobbi_ratings`. Rodar `0007` e `0008` no SQL Editor do FLOW.

---

## 23. UX/UI

A interface deve ter nível profissional.

Referências conceituais:

- Apple;
- Stripe;
- Google;
- sistemas enterprise modernos;
- dashboards premium.

Evitar:

- visual genérico;
- excesso de gradientes;
- excesso de glow;
- excesso de cards;
- sombras exageradas;
- interface poluída;
- aparência de template;
- aparência de ERP antigo;
- botões gigantes sem necessidade;
- excesso de informações simultâneas.

Priorizar:

- hierarquia visual;
- espaçamento;
- tipografia;
- contraste;
- clareza;
- consistência;
- responsividade;
- microinterações;
- feedback visual;
- estados de loading;
- estados vazios;
- estados de erro;
- acessibilidade.

O logo/identidade FLOW deve manter uma estética minimalista, forte e corporativa.

---

## 24. Navegação

A navegação deve ser previsível.

Sidebar principal:

- Dashboard
- Funcionários
- Cartões
- Vales
- Lojas
- Escalas
- Metas
- Observações
- Relatórios
- Avisos
- Auditoria
- Configurações

O usuário deve conseguir encontrar rapidamente qualquer recurso.

Adicionar busca global quando apropriado.

Idealmente, `CTRL + K` abre uma busca global.

Exemplos:

- Maria Oliveira
- Cartão 4832
- Loja 03
- Vale de domingo
- Relatório
- Configurações

---

## 25. Estados de interface

Todos os módulos devem possuir:

- loading;
- empty state;
- error state;
- success state;
- confirmação;
- skeleton quando apropriado;
- feedback após ações.

Não deixar telas quebradas ou vazias sem explicação.

---

## 26. Dados e cálculos

Todos os indicadores devem ser calculados com dados reais.

Nunca esconder a origem dos números.

Quando possível, permitir que o usuário veja:

- período utilizado;
- fonte dos dados;
- quantidade considerada;
- fórmula utilizada.

Exemplo:

> Projeção baseada em 20 dias trabalhados e média de 4,1 cartões/dia.

---

## 27. Consistência

Uma mesma informação deve possuir uma única fonte de verdade.

Exemplo:

Se a quantidade de cartões vem do sistema existente, o Dashboard, perfil do funcionário e relatório devem consultar a mesma fonte.

Não manter:

- Dashboard = 82
- Perfil = 80
- Relatório = 84

sem existir uma justificativa clara de filtros/períodos.

Todos os módulos devem usar as mesmas regras de cálculo.

---

## 28. Filtros

Filtros devem ser consistentes.

Filtros comuns:

- período;
- loja;
- funcionário;
- cargo;
- status;
- gerente;
- equipe.

Quando um filtro estiver aplicado, deixar isso visualmente claro.

Permitir limpar filtros facilmente.

---

## 29. Performance

O FLOW deve ser rápido.

Evitar:

- consultas desnecessárias;
- chamadas duplicadas;
- carregar milhares de registros sem paginação;
- cálculos pesados no frontend quando poderiam ser feitos no backend;
- consultas sem índices;
- chamadas repetitivas.

Usar:

- paginação;
- cache quando apropriado;
- queries eficientes;
- agregações;
- debounce em buscas;
- carregamento sob demanda.

---

## 30. Responsividade

O sistema deve funcionar bem em:

- desktop;
- notebooks;
- diferentes resoluções.

Como o FLOW é voltado principalmente para gestão, desktop deve receber atenção especial.

---

## 31. Arquitetura

Separar claramente:

- Frontend
- Backend/API
- Database
- Integrações
- Autenticação
- Autorização
- Auditoria

Não misturar regras críticas de negócio em componentes visuais.

Regras de negócio devem ficar em camadas apropriadas.

---

## 32. Autenticação

A autenticação deve ser segura.

Sessões e tokens devem ser tratados corretamente.

Nunca armazenar credenciais de forma insegura.

Toda rota protegida deve validar autenticação.

Toda operação protegida deve validar autorização.

---

## 33. Princípio de não destruição

Durante o desenvolvimento:

- **NÃO** remover funcionalidades existentes sem solicitação explícita.
- **NÃO** apagar código existente sem necessidade.
- **NÃO** substituir implementações funcionais simplesmente por preferência estética.
- **NÃO** quebrar funcionalidades existentes para implementar novas funcionalidades.

Quando alterar código:

- preservar comportamento existente;
- adicionar o necessário;
- corrigir apenas o que for necessário;
- evitar regressões.

---

## 34. Documentação

Toda decisão importante deve ser documentada.

Documentar especialmente:

- integrações;
- regras de cálculo;
- metas;
- projeções;
- permissões;
- banco;
- auditoria;
- arquitetura;
- autenticação.

---

## 35. Princípios de desenvolvimento

Sempre:

- analisar antes de alterar;
- entender código existente;
- reutilizar componentes;
- reutilizar serviços;
- evitar duplicação;
- manter código limpo;
- manter tipagem forte;
- validar entradas;
- tratar erros;
- proteger dados;
- testar funcionalidades críticas.

Nunca assumir que algo existe sem verificar.

---

## 36. Futuro do produto

O FLOW deve ser desenvolvido pensando em expansão.

Possíveis módulos futuros:

- RH;
- férias;
- benefícios;
- folha;
- documentos;
- treinamentos;
- patrimônio;
- uniformes;
- estoque;
- chamados internos;
- metas avançadas;
- indicadores financeiros;
- checklist de loja;
- controle de abertura/fechamento;
- gestão de equipamentos;
- comunicados;
- avaliações;
- reconhecimento de funcionários.

A arquitetura não deve impedir essas expansões.

---

## 37. Objetivo final

O FLOW deve permitir que um gerente abra o aplicativo e consiga responder rapidamente:

- Como está minha operação?
- Quem está trabalhando?
- Quem está performando bem?
- Quem está abaixo da meta?
- Quantos cartões foram feitos?
- Qual é a projeção?
- Quanto falta para atingir a meta?
- Quais funcionários precisam de atenção?
- Quanto foi pago em vales?
- Quais vales estão pendentes?
- Como está cada loja?
- Quais são os avisos?
- O que aconteceu recentemente?
- Quem alterou determinado dado?
- Qual é o histórico desse funcionário?

Tudo isso deve estar disponível em uma experiência única, organizada, segura e profissional.

---

## 38. Regra final para agentes de IA

Qualquer agente de IA que trabalhar neste projeto deve:

1. Ler este `rules.md` antes de modificar o projeto.
2. Entender a arquitetura existente antes de criar novas estruturas.
3. Não inventar dados, tabelas ou APIs.
4. Não remover funcionalidades sem autorização.
5. Não quebrar funcionalidades existentes.
6. Não expor dados sensíveis.
7. Respeitar permissões no backend.
8. Manter auditoria para operações sensíveis.
9. Usar dados reais quando disponíveis.
10. Separar claramente mock de produção.
11. Preservar consistência entre Dashboard, Funcionários, Cartões e Relatórios.
12. Manter o padrão visual profissional do FLOW.
13. Priorizar clareza sobre complexidade.
14. Priorizar segurança sobre conveniência.
15. Priorizar dados confiáveis sobre números visualmente bonitos.
16. Antes de criar uma nova solução, verificar se já existe uma implementação que possa ser reutilizada.
17. Não fazer refatorações gigantes sem necessidade.
18. Não modificar banco de produção sem entender o impacto.
19. Toda nova funcionalidade deve respeitar os módulos e regras existentes.
20. Se uma regra do negócio não estiver definida, não assumir silenciosamente: documentar a dúvida e escolher a solução mais segura e reversível quando for possível continuar sem bloquear o desenvolvimento.

O FLOW deve ser tratado como um produto empresarial real e escalável, não como um protótipo descartável.
