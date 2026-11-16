// The seed matter SF-2024-0007 (flowleap-seed-firm, row 6): the German Art. 94(3) communication on EP 24 166 597.5
// of 18 Sep 2026 with its annex, 11 pages. The letter text is the stored text layer of the seed (letter-pages.json),
// with the representative's address and the examiner's name left out. The reading below is the one that the
// walkthrough shows; its passages stand once on their pages of that text.

export const matter = {
  key: 'SF-2024-0007',
  title: 'Contact assembly, conductor terminal',
  client: 'Wago Verwaltungsgesellschaft mbH',
  app: 'EP 24 166 597.5',
  letter: 'Art. 94(3) communication of 18 Sep 2026',
}

export const people = {
  sabine: { name: 'Sabine Wolf', role: 'Formalities', av: 'S' },
  tobias: { name: 'Tobias Schmitt', role: 'Formalities', av: 'T' },
  jonas: { name: 'Jonas Weber', role: 'Attorney', av: 'J' },
  lena: { name: 'Lena Hoffmann', role: 'Attorney', av: 'L' },
}

// One item for each objection. `claims` is what the agent wrote; item 3 shows the fault that the founder met: the agent
// wrote 2–14 where its own passage says "Ansprüche 2-15".
export const items = [
  { n: 1, ground: 'Art. 54 EPC: novelty', claims: '1', docs: 'D3, D1', page: 3, quote: 'nicht neu im Sinne des Artikels 54 (1) und (2) EPÜ ist',
    reasoning: 'Claim 1 is not new over D3. The examiner keeps this view after the applicant\'s arguments: claim 1 does not limit the structure of the clamping spring or the lever. D1 shows the same features a) to e).' },
  { n: 2, ground: 'Art. 56 EPC: inventive step', claims: '1', docs: 'D5, D3', page: 5, quote: 'aus der Kombination von D5 und D3 naheliegend ist',
    reasoning: 'Claim 1 is obvious from D5 with D3. The difference to D5 is the third wall formed partly by the busbar part and partly by the spring part; D3 shows that split.' },
  { n: 3, ground: 'Art. 54 and 56 EPC: dependent claims', claims: '2–14', fixed: '2–15', docs: 'D3, D5', page: 8, quote: 'Die abhängigen Ansprüche 2-15',
    reasoning: 'The dependent claims add no feature that gives novelty or an inventive step. Claims 2 to 14 are known from D3; claim 15 from D5.' },
  { n: 4, ground: 'Rule 43(1) EPC: no allowable claim seen', claims: '1–15', docs: 'none', page: 10, quote: 'Gegenwärigt ist nicht erkennbar',
    reasoning: 'The examiner sees no part of the application that can give an allowable claim. A new independent claim must follow Rule 43(1), with the problem and solution approach (Guidelines G-VII, 5).' },
  { n: 5, ground: 'Rule 42(1)(b) EPC: description', claims: 'none', docs: 'D1–D5', page: 11, quote: 'ist in der Beschreibung D1-D5 zu nennen',
    reasoning: 'The description must name D1 to D5 and say which features of claim 1 are known from D3 or D5. Amendments must be marked, with their basis (Rule 137(4)).' },
]

export const docs = [
  { d: 'D1', pub: 'DE 88 00 750 U1', date: '10 Mar 1988', page: 3, quote: 'D1 DE 88 00 750 U1', used: '1, 5' },
  { d: 'D2', pub: 'DE 101 52 519 A1', date: '8 May 2003', page: 3, quote: 'D2 DE 101 52 519 A1', used: '5' },
  { d: 'D3', pub: 'US 2011/318975 A1', date: '29 Dec 2011', page: 3, quote: 'D3 US 2011/318975 A1', used: '1, 2, 3, 5' },
  { d: 'D4', pub: 'EP 3 145 031 A2', date: '22 Mar 2017', page: 3, quote: 'D4 EP 3 145 031 A2', used: '5' },
  { d: 'D5', pub: 'DE 20 2014 104661 U1', date: '28 Oct 2014', page: 3, quote: 'D5 DE 20 2014 104661 U1', used: '2, 3, 5', note: 'New in this letter' },
]

// Which objections name each claim (claims 1 to 15).
export const claimHits = Array.from({ length: 15 }, (_, i) => {
  const c = i + 1
  return { c, by: c === 1 ? '1, 2, 4' : c === 15 ? '3, 4' : '3, 4' }
})
