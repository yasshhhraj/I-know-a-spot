export const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
export const MODEL_REVISION = '751bff37182d3f1213fa05d7196b954e230abad9';
export const MODEL_IDENTITY = `${MODEL_ID}@${MODEL_REVISION}:q8:cpu:mean-normalized:256:trim-v1`;

export interface TextEncoder {
  encode(text: string): Promise<Float64Array>;
  dispose?(): Promise<void>;
}
