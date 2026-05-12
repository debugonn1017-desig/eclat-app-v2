import { PHRASE_TABLE } from './lib/lineGen/phrasePool.ts'
import { validateMessage } from './lib/lineGen/validator.ts'
let totalCells = 0, totalCandidates = 0, problemCount = 0
for (const score of [1,2,3,4,5]) {
  for (const sit of Object.keys(PHRASE_TABLE[score])) {
    for (const slot of ['greeting','care','call','close']) {
      totalCells++
      const list = PHRASE_TABLE[score][sit][slot]
      for (const c of list) {
        totalCandidates++
        const r = validateMessage(c)
        if (!r.ok) {
          console.log(`NG: score=${score} sit=${sit} slot=${slot} - "${c}" - ${r.problems.join('|')}`)
          problemCount++
        }
      }
    }
  }
}
console.log(`Cells=${totalCells} Candidates=${totalCandidates} Problems=${problemCount}`)
