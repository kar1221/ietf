import { fetchDocumentHashesByYear } from './mailarchive/client.js';

const hashes = await fetchDocumentHashesByYear('quic', '2026');

console.log(hashes);
