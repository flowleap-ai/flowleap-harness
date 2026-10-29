/**
 * Sample office action analysis for the look-first review of the board. The application, the cited documents, and every
 * passage are invented for the sample; they are not register data. The analysis file of #81 replaces this fixture.
 */

import type { OfficeActionAnalysis } from './board.ts'

/** The sample analysis: a Communication under Article 94(3) EPC with three objections. */
export const SAMPLE_ANALYSIS: OfficeActionAnalysis = {
  application: 'EP 3 456 789',
  communication: 'Communication under Article 94(3) EPC',
  issued: '2026-08-09',
  deadline: '2026-12-09',
  owner: 'M. Keller',
  pdf: 'EP3456789_communication_94-3.pdf',
  agent: 'Patent Agent',
  agents: ['Patent Agent', 'Office action responder'],
  budget: { left: 142, limit: 200, currency: 'EUR' },
  run: { step: 2, steps: 5 },
  documents: {
    D1: { number: 'EP 2 987 654 A1', title: 'Adhesive skin patch with a temperature sensor and a radio link' },
    D2: { number: 'US 2019/0123456 A1', title: 'Adaptive sampling in a wearable monitor' },
  },
  objections: [
    {
      id: 'art54',
      basis: 'art54',
      claims: [1, 2],
      summary: 'D1 discloses all features of claims 1 and 2, including the controller that changes the sampling rate.',
      examinerText: 'Document D1 discloses (see paragraphs [0012] to [0031] and figure 2) a wearable sensor patch comprising a flexible substrate, a temperature sensor on the substrate, a wireless transmitter, and a controller that increases the sampling rate when the measured temperature changes. The subject-matter of claim 1 is therefore not new (Article 54(1) and (2) EPC). The same applies to dependent claim 2.',
      citations: [
        { label: 'D1', location: '[0012]', text: 'The patch has a flexible polyimide carrier that follows the skin.' },
        { label: 'D1', location: '[0031]', text: 'When two readings differ by more than 0.2 K, the microcontroller reads the sensor every second instead of every minute.' },
      ],
      comparison: [
        { feature: '1.1', claimText: 'a flexible substrate', source: 'D1 [0012]', passage: 'a flexible polyimide carrier that follows the skin' },
        { feature: '1.2', claimText: 'a temperature sensor on the substrate', source: 'D1 [0014]', passage: 'a thermistor bonded to the carrier' },
        { feature: '1.3', claimText: 'a wireless transmitter', source: 'D1 [0018]', passage: 'a Bluetooth Low Energy module' },
        { feature: '1.4', claimText: 'a controller that sets the sampling rate as a function of the rate of temperature change', source: 'D1 [0031]', passage: 'reads the sensor every second instead of every minute when two readings differ by more than 0.2 K' },
      ],
      options: [
        { kind: 'argue', summary: 'D1 uses a fixed threshold between two readings, not a rate of change. Argue that feature 1.4 is not disclosed.' },
        { kind: 'amend', summary: 'Add from description p. 9, l. 4-8: the rate is a continuous function of the change per minute.' },
      ],
    },
    {
      id: 'art56',
      basis: 'art56',
      claims: [3, 4, 5, 6],
      summary: 'Claims 3 to 6 are obvious over D1 combined with D2, which teaches adaptive sampling to save power.',
      examinerText: 'Dependent claims 3 to 6 do not contain features which, in combination with the features of any claim to which they refer, meet the requirements of the EPC with respect to inventive step (Article 56 EPC). The skilled person would combine D1 with D2 (column 5, lines 10 to 25), which teaches lowering the sampling rate of a wearable monitor to extend battery life.',
      citations: [
        { label: 'D1', location: '[0031]', text: 'When two readings differ by more than 0.2 K, the microcontroller reads the sensor every second instead of every minute.' },
        { label: 'D2', location: 'col. 5, l. 10-25', text: 'The monitor lowers its sampling rate while the signal is stable, which extends the battery life by up to 40 %.' },
      ],
      comparison: [
        { feature: '3', claimText: 'the controller lowers the transmit power while the sampling rate is low', source: 'D2 col. 6, l. 3-9', passage: 'the radio sends a batch every ten minutes while the signal is stable' },
        { feature: '5', claimText: 'a second sensor that measures skin conductance', source: 'D1 [0040]', passage: 'other sensors, for example a heart rate sensor, can be added' },
      ],
      options: [
        { kind: 'argue', summary: 'D2 batches the transmissions but keeps the transmit power. No document teaches a lower power.' },
        { kind: 'amend', summary: 'Combine claims 3 and 5 into claim 1, if the novelty argument for feature 1.4 fails.' },
        { kind: 'accept', summary: 'Delete claims 4 and 6. They add no commercial value.' },
      ],
    },
    {
      id: 'art84',
      basis: 'art84',
      claims: [1],
      summary: 'The term "rapid" in claim 1 is a relative term without a defined meaning.',
      examinerText: 'The term "rapid temperature change" used in claim 1 is a relative term which renders the definition of the subject-matter of the claim unclear (Article 84 EPC). The description does not give a standard for measuring the term.',
      citations: [],
      comparison: [
        { feature: '1.4', claimText: 'a rapid temperature change', source: 'Description p. 9, l. 4-8', passage: 'a change of more than 0.1 K per minute' },
      ],
      options: [
        { kind: 'amend', summary: 'Replace "rapid" with "of more than 0.1 K per minute", from description p. 9, l. 4-8.' },
        { kind: 'argue', summary: 'Weak. The description gives a number, so the examiner will ask for the amendment.' },
      ],
    },
  ],
  attorney: {
    art54: { state: 'needs_review', owner: 'M. Keller' },
    art56: { state: 'needs_review', owner: 'S. Brandt' },
    art84: { state: 'relevant', owner: '' },
  },
}
