/**
 * Figurenbild von chessground. Das Figuren-CSS hängt am Element <piece> (z. B. „.cg-wrap piece.knight.white“),
 * das React nicht kennt. Deshalb als reines HTML in einem unsichtbaren Rahmen (display: contents) –
 * gleiches Aussehen, keine Warnung „The tag <piece> is unrecognized“.
 */
export function Piece({ className }: { className: string }) {
  const safe = className.replace(/[&<>"']/g, '');
  return <span className="contents" aria-hidden dangerouslySetInnerHTML={{ __html: `<piece class="${safe}"></piece>` }} />;
}
