import { create } from "zustand";

export type ClipboardOffer = {
    ownerKey: string;
    generation: number;
    content: string;
    hash: string;
};

/** 候选正文仅驻留内存，跨路由展示同一份，不自动落库。 */
export const useClipboardOfferStore = create<{
    offer: ClipboardOffer | null;
}>(() => ({
    offer: null,
}));
