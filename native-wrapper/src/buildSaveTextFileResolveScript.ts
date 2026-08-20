export type SaveTextFileResult = {
  requestId: string;
  ok: boolean;
  message?: string;
};

/** Inject save result callback into the WebView main world. */
export function buildSaveTextFileResolveScript(
  result: SaveTextFileResult,
): string {
  return `(function(){try{window.gnhMobile&&window.gnhMobile._resolveSaveTextFile(${JSON.stringify(result)});}catch(e){}})();true;`;
}
