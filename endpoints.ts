import { randomInt } from "crypto";
import dayjs from "dayjs";
import express from "express";
import uniqid from "uniqid";
import firebase from "../../../firebase";
import {
  ApiTrovoError,
  ApiTrovoQr,
  ApiTrovoQrSlotEmpty,
  ApiTrovoQrSlotFulfilled,
  ApiTrovoResponse,
} from "../../../types";
import { dotenv } from "../../../utils";

const trovoQrErrors = {
  "internal/unauthorized": {
    statusCode: 401,
    message: "Senha da API incorreta ou não informada",
  },
  "bad-request/missing-id": {
    statusCode: 400,
    message: "Nenhum código QR informado",
  },
  "bad-request/invalid-id": {
    statusCode: 400,
    message: "Código QR inválido",
  },
  "bad-request/not-found": {
    statusCode: 404,
    message: "Código QR não encontrado",
  },
  "bad-request/missing-uid": {
    statusCode: 400,
    message: "Nenhum ID de usuário informado",
  },
  "forbidden/already-registered": {
    statusCode: 403,
    message: "Usuário já vinculado à conta",
  },
  "forbidden/no-slots-available": {
    statusCode: 403,
    message: "Não há mais espaços de conta disponíveis",
  },
  "not-found/user-not-registered": {
    statusCode: 404,
    message: "Usuário não vinculado à conta",
  },
};

const respondWithError = <T>(
  res: express.Response<ApiTrovoResponse<T>>,
  errorCode: keyof typeof trovoQrErrors
) => {
  const error: ApiTrovoError = {
    code: errorCode,
    message: trovoQrErrors[errorCode].message,
  };
  res.status(trovoQrErrors[errorCode].statusCode).json({ error, data: null });
};

const getQr = async (
  id: any
): Promise<
  | { error: keyof typeof trovoQrErrors }
  | {
      doc: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>;
      data: ApiTrovoQr;
    }
> => {
  const qrIdIsString = (qrId: any): qrId is string => typeof qrId === "string";

  if (!qrIdIsString(id)) {
    return { error: "bad-request/invalid-id" };
  }

  const qrId = id.trim().toLowerCase();

  const qrIdChunks = qrId.split("-");

  if (
    qrIdChunks.length !== 4 ||
    qrIdChunks.some(
      (chunk) => !(chunk.length === 5 && Number.isInteger(parseInt(chunk)))
    )
  ) {
    return { error: "bad-request/invalid-id" };
  }

  const qrDoc = await firebase.trovo
    .firestore()
    .collection("qr-ids")
    .doc(qrId)
    .get();

  if (!(qrDoc.exists && qrDoc.data())) {
    return { error: "bad-request/not-found" };
  }

  const qr = qrDoc.data() as ApiTrovoQr;

  return { doc: qrDoc, data: qr };
};

export const createQrIds: express.RequestHandler<
  null,
  ApiTrovoResponse<{ status: "success"; quantity: number }>,
  { auth?: string; quantity?: number | string },
  null
> = async (req, res) => {
  let {
    body: { auth, quantity },
  } = req;

  if (!auth || auth !== dotenv().api.password) {
    return respondWithError(res, "internal/unauthorized");
  }

  if (!quantity) {
    quantity = 1;
  } else if (typeof quantity === "string") {
    quantity = parseInt(quantity);
  }

  if (quantity < 1) {
    quantity = 1;
  }

  const now = dayjs();

  const qrIds: ApiTrovoQr<true>[] = [...Array(quantity)].map(() => ({
    id: `${randomInt(10000, 99999)}-${randomInt(10000, 99999)}-${randomInt(
      10000,
      99999
    )}-${randomInt(10000, 99999)}`,
    generatedAt: now.format(),
    registeredAt: null,
    registeredBy: null,
    slots: [
      { empty: true, uid: null, scanId: null },
      { empty: true, uid: null, scanId: null },
      { empty: true, uid: null, scanId: null },
      { empty: true, uid: null, scanId: null },
      { empty: true, uid: null, scanId: null },
    ],
    scans: [],
  }));

  const batch = firebase.trovo.firestore().batch();

  qrIds.forEach((qr) => {
    batch.set(firebase.trovo.firestore().collection("qr-ids").doc(qr.id), qr);
  });

  await batch.commit();

  res.json({ error: null, data: { status: "success", quantity } });
};

export const getTrovoQr: express.RequestHandler<
  { id?: string },
  ApiTrovoResponse<ApiTrovoQr>,
  null,
  null
> = async (req, res) => {
  const {
    params: { id: qrId },
  } = req;

  if (!qrId) {
    return respondWithError(res, "bad-request/missing-id");
  }

  const qr = await getQr(qrId);

  if ("error" in qr) {
    return respondWithError(res, qr.error);
  }

  res.status(200).json({ error: null, data: qr.data });
};

export const addTrovoQrSlot: express.RequestHandler<
  { id?: string },
  ApiTrovoResponse<ApiTrovoQr>,
  { uid?: string },
  null
> = async (req, res) => {
  const {
    params: { id: qrId },
    body: { uid },
  } = req;

  if (!qrId) {
    return respondWithError(res, "bad-request/missing-id");
  }
  if (!uid) {
    return respondWithError(res, "bad-request/missing-uid");
  }

  const qr = await getQr(qrId);

  if ("error" in qr) {
    return respondWithError(res, qr.error);
  }

  if (qr.data.slots.some((slot) => slot.uid === uid)) {
    return respondWithError(res, "forbidden/already-registered");
  }

  const emptySlotIdx = qr.data.slots.findIndex((slot) => slot.empty);

  if (emptySlotIdx === -1) {
    return respondWithError(res, "forbidden/no-slots-available");
  }

  const scanId = uniqid();
  const fulfilledSlot: ApiTrovoQrSlotFulfilled = {
    empty: false,
    uid,
    scanId,
  };

  const updatedSlots: ApiTrovoQr["slots"] = [...qr.data.slots];
  updatedSlots[emptySlotIdx] = fulfilledSlot;

  const timestamp = dayjs().format();

  const updatedQrData: ApiTrovoQr = {
    ...qr.data,
    slots: updatedSlots,
    scans: [
      ...qr.data.scans,
      { scanId, scannedAt: timestamp, successful: true },
    ],
    registeredAt: emptySlotIdx === 0 ? timestamp : qr.data.registeredAt,
    registeredBy: emptySlotIdx === 0 ? uid : qr.data.registeredBy,
  };

  await qr.doc.ref.update(updatedQrData);

  const updatedQr = await getQr(qrId);

  if ("error" in updatedQr) {
    return respondWithError(res, updatedQr.error);
  }

  res.status(201).json({ error: null, data: updatedQr.data });
};

export const removeTrovoQrSlot: express.RequestHandler<
  { id?: string },
  ApiTrovoResponse<ApiTrovoQr>,
  { uid?: string },
  null
> = async (req, res) => {
  const {
    params: { id: qrId },
    body: { uid },
  } = req;

  if (!qrId) {
    return respondWithError(res, "bad-request/missing-id");
  }
  if (!uid) {
    return respondWithError(res, "bad-request/missing-uid");
  }

  const qr = await getQr(qrId);

  if ("error" in qr) {
    return respondWithError(res, qr.error);
  }

  const slotIdx = qr.data.slots.findIndex((slot) => slot.uid === uid);

  if (slotIdx === -1) {
    return respondWithError(res, "not-found/user-not-registered");
  }

  const scanId = uniqid();
  const emptySlot: ApiTrovoQrSlotEmpty = {
    empty: true,
    uid: null,
    scanId: null,
  };

  const updatedSlots: ApiTrovoQr["slots"] = [...qr.data.slots];
  updatedSlots[slotIdx] = emptySlot;

  const timestamp = dayjs().format();

  const updatedQrData: ApiTrovoQr = {
    ...qr.data,
    slots: updatedSlots,
    scans: [
      ...qr.data.scans,
      { scanId, scannedAt: timestamp, successful: true },
    ],
  };

  await qr.doc.ref.update(updatedQrData);

  const updatedQr = await getQr(qrId);

  if ("error" in updatedQr) {
    return respondWithError(res, updatedQr.error);
  }

  res.status(201).json({ error: null, data: updatedQr.data });
};
