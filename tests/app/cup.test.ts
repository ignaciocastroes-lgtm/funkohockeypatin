import test from "node:test"
import assert from "node:assert/strict"
import { newCup, recordResult, nextMatch, sanitizeCup } from "../../lib/app/cup"

const IDS: [string, string, string, string] = ["t1", "t2", "t3", "t4"]
const VALID = new Set(IDS)

test("arranca con las dos semis listas y la final vacía", () => {
  const cup = newCup(IDS)
  assert.deepEqual(nextMatch(cup), { which: 0, home: "t1", away: "t2" })
  assert.equal(cup.final.home, null)
  assert.equal(cup.championId, null)
})

test("un empate no avanza el bracket: hay que repetir el cruce", () => {
  const cup = newCup(IDS)
  const { cup: after, drawn } = recordResult(cup, 0, [2, 2])
  assert.equal(drawn, true)
  assert.equal(after, cup) // sin cambios
  assert.deepEqual(nextMatch(after), { which: 0, home: "t1", away: "t2" })
})

test("tras las dos semis, la final se arma con los ganadores", () => {
  let cup = newCup(IDS)
  cup = recordResult(cup, 0, [3, 1]).cup // gana t1
  cup = recordResult(cup, 1, [0, 2]).cup // gana t4
  assert.deepEqual(nextMatch(cup), { which: "final", home: "t1", away: "t4" })
})

test("la final define campeón", () => {
  let cup = newCup(IDS)
  cup = recordResult(cup, 0, [3, 1]).cup
  cup = recordResult(cup, 1, [0, 2]).cup
  cup = recordResult(cup, "final", [1, 4]).cup
  assert.equal(cup.championId, "t4")
  assert.equal(nextMatch(cup), null)
})

test("sanitizeCup rechaza ids repetidos o desconocidos, y basura", () => {
  assert.equal(sanitizeCup(null, VALID), null)
  assert.equal(sanitizeCup({ id: "x", teamIds: ["t1", "t1", "t2", "t3"], semis: [{}, {}], final: {} }, VALID), null)
  assert.equal(sanitizeCup({ id: "x", teamIds: ["t1", "t2", "t3", "zzz"], semis: [{}, {}], final: {} }, VALID), null)
  const cup = newCup(IDS)
  const roundTrip = sanitizeCup(JSON.parse(JSON.stringify(cup)), VALID)
  assert.deepEqual(roundTrip, cup)
})
