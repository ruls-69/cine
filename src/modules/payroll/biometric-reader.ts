/** Browser file adapter. Salary calculations never read files in the client. */
export interface BiometricFile {
  readonly name: string;
  readonly size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}
export async function encodeBiometric(file: BiometricFile | undefined): Promise<{file: string; filename: string}> {
  if(!file || file.size>2_000_000) throw new Error('Selecciona un archivo de hasta 2 MB.');
  const bytes=new Uint8Array(await file.arrayBuffer());
  let text='';
  for(let i=0;i<bytes.length;i+=8192) text+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return {file:btoa(text),filename:file.name};
}
