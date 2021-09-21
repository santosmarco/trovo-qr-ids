# Trovo — QR REST API

## O que é

Todos os kits físicos da Trovo (o globo) incluem uma carta de agradecimento. Cada uma dessas cartas possui um número de série único e um QR Code referente a esse número.

Ao abrir o app pela primeira vez após a compra do globo, o usuário é solicitado a escanear o QR Code ou inserir o número de série contidos nessa carta.

## Estrutura da informação

Os códigos QR carregam consigo a informação do número de série vinculado ao globo.

Tais números de série são **necessariamente compostos por quatro componentes de cinco dígitos cada, separados por um traço:** `\d{5}-\d{5}-\d{5}-\d{5}`

_Exemplo:_

```txt
12345-67890-09876-54321
```

O código QR, por sua vez, envelopa essa informação, respeitando à seguinte estrutura: `data:trovo:[serialNumber]`.

_Exemplo:_

```txt
data:trovo:12345-67890-09876-54321
```

Dessa forma, o QR Code não possui qualquer utilidade nem performa qualquer ação se escaneado sob qualquer outro contexto que não o do próprio aplicativo da Trovo.

Portanto, cabe ao aplicativo interpretar o QR Code e extrair dele a informação do número de série (sempre contida após a string `data:trovo:`).

---

## API

Em posse do número de série, o app pode interagir com três endpoints REST:

- Base URL: `https://us-central1-nova-a3-ind.cloudfunctions.net/`
- Endpoints:
  - `GET /api/rest/trovo/qr/:id` — Consulta a estrutura do número de série `id`
  - `POST /api/rest/trovo/qr/:id/slots` — Adiciona um determinado usuário a qualquer slot livre no número de série `id`
  - `DELETE /api/rest/trovo/qr/:id/slots` — Remove um determinado usuário de seu respectivo slot no número de série `id`

A API sempre retornará um objeto estruturado da seguinte forma:

```ts
type ApiResponse = {
  error: ApiError | null;
  data: QrId | null;
};

type ApiError = {
  code: string;
  message: string;
};
```

> **Em caso de erro:**
>
> Em caso de erro com a requisição, a API retornará um objeto `error: ApiError`, composto por um dos sete códigos de erro pré-definidos e uma mensagem em português que pode ser mostrada ao usuário sem necessidade de tratamento.
>
> Ver erros pré-definidos.

### 1. `GET /api/rest/trovo/qr/:id`

Consulta a estrutura do número de série `id`.

Todos os números de série (`QrId`) gravados no banco de dados são estruturados da seguinte forma:

```ts
type QrId = {
  id: string;
  generatedAt: string;
  registeredAt: string | null;
  registeredBy: string | null;
  slots: [Slot, Slot, Slot, Slot, Slot];
  scans: Scan[];
};

type Slot = {
  empty: boolean;
  uid: string | null;
  scanId: string | null;
};

type Scan = {
  scanId: string;
  scannedAt: string;
  successful: boolean;
};
```

Ao realizar uma consulta a esse endpoint, a API retorna o `QrId` relacionado ao parâmetro de rota `:id`.

- **Parâmetros**
  - `id: string` — O número de série do `QrId` a ser consultado
- **Body:** _Vazio_
- **Retorna**
  - `QrId`
- Possíveis erros:
  - `bad-request/missing-id` — Quando o endpoint for requisitado sem o parâmetro `:id`
  - `bad-request/invalid-id` — Quando o parâmetro `:id` for incompatível com a composição dos números de série: `\d{5}-\d{5}-\d{5}-\d{5}`
  - `bad-request/not-found` — Quando o parâmetro `:id` for válido, porém não existir nenhum `QrId` vinculado a ele

### 2. `POST /api/rest/trovo/qr/:id/slots`

Adiciona um determinado usuário a qualquer slot livre no `QrId` de número de série _`:id`._

- **Parâmetros**
  - `id: string` — O número de série do `QrId`
- **Body**
  - `uid: string` — O _`UID`_ do usuário no Firebase
- **Retorna**
  - `QrId` _(atualizado com o slot preenchido)_
- Possíveis erros:
  - `bad-request/missing-id` — Quando o endpoint for requisitado sem o parâmetro `:id`
  - `bad-request/invalid-id` — Quando o parâmetro `:id` for incompatível com a composição dos números de série: `\d{5}-\d{5}-\d{5}-\d{5}`
  - `bad-request/not-found` — Quando o parâmetro `:id` for válido, porém não existir nenhum `QrId` vinculado a ele
  - `bad-request/missing-uid` — Quando o endpoint for requisitado sem o parâmetro `uid` do `body`
  - `forbidden/already-registered` — Quando o usuário `uid` já estiver preenchendo um slot no `QrId`
  - `forbidden/no-slots-available` — Quando o `QrId` não possuir mais nenhum slot disponível

### 3. `DELETE /api/rest/trovo/qr/:id/slots`

Remove um determinado usuário de seu respectivo slot no `QrId` de número de série _`:id`._

- **Parâmetros**
  - `id: string` — O número de série do `QrId`
- **Body**
  - `uid: string` — O _`UID`_ do usuário no Firebase
- **Retorna**
  - `QrId` _(atualizado com o slot esvaziado)_
- Possíveis erros:
  - `bad-request/missing-id` — Quando o endpoint for requisitado sem o parâmetro `:id`
  - `bad-request/invalid-id` — Quando o parâmetro `:id` for incompatível com a composição dos números de série: `\d{5}-\d{5}-\d{5}-\d{5}`
  - `bad-request/not-found` — Quando o parâmetro `:id` for válido, porém não existir nenhum `QrId` vinculado a ele
  - `bad-request/missing-uid` — Quando o endpoint for requisitado sem o parâmetro `uid` do `body`
  - `not-found/user-not-registered` — Quando não existir nenhum slot no `QrId` sendo ocupado pelo usuário `uid`

### Possíveis erros

| Código                          | Mensagem                                 |
| ------------------------------- | ---------------------------------------- |
| `bad-request/missing-id`        | Nenhum código QR informado               |
| `bad-request/invalid-id`        | Código QR inválido                       |
| `bad-request/not-found`         | Código QR não encontrado                 |
| `bad-request/missing-uid`       | Nenhum ID de usuário informado           |
| `forbidden/already-registered`  | Usuário já vinculado à conta             |
| `forbidden/no-slots-available`  | Não há mais espaços de conta disponíveis |
| `not-found/user-not-registered` | Usuário não vinculado à conta            |
