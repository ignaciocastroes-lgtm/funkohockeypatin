import test from "node:test"
import assert from "node:assert/strict"
import { applyShootoutAttempt, initialShootout } from "../../lib/game/shootout"

test("shootout: arranca 0-0, le toca al lado 0 primero", () => {
  const s = initialShootout()
  assert.deepEqual(s.attempts, [0, 0])
  assert.deepEqual(s.made, [0, 0])
  assert.equal(s.turn, 0)
})

test("shootout: alterna turno después de cada intento, sin decidir antes de los 3 por lado", () => {
  let s = initialShootout()
  const turns: number[] = []
  for (let i = 0; i < 5; i++) {
    turns.push(s.turn)
    const r = applyShootoutAttempt(s, true)
    assert.equal(r.result, null, `no debería decidirse en el intento ${i + 1}`)
    s = r.state
  }
  assert.deepEqual(turns, [0, 1, 0, 1, 0])
})

test("shootout: 3 por lado, uno mete los 3 y el otro falla los 3 — gana clarísimo", () => {
  let s = initialShootout()
  let result = null
  const seq = [true, false, true, false, true, false] // 0,1,0,1,0,1
  for (const scored of seq) {
    const r = applyShootoutAttempt(s, scored)
    s = r.state
    result = r.result
  }
  assert.ok(result)
  assert.equal(result!.winner, 0)
  assert.deepEqual(result!.made, [3, 0])
  assert.deepEqual(result!.attempts, [3, 3])
})

test("shootout: empatados 2-2 después de las 3 rondas, se sigue a muerte súbita hasta decidir", () => {
  let s = initialShootout()
  // ronda 1: 0 mete, 1 mete (1-1) — ronda 2: 0 falla, 1 mete (1-2) — ronda 3: 0 mete, 1 falla (2-2)
  for (const scored of [true, true, false, true, true, false]) {
    s = applyShootoutAttempt(s, scored).state
  }
  assert.deepEqual(s.made, [2, 2])
  assert.deepEqual(s.attempts, [3, 3])
  // ronda extra: 0 mete, 1 falla -> decide ahí mismo, sin necesitar una ronda entera más
  const r1 = applyShootoutAttempt(s, true) // lado 0
  assert.equal(r1.result, null, "todavía falta el intento del lado 1 de esta ronda extra")
  const r2 = applyShootoutAttempt(r1.state, false) // lado 1 falla
  assert.ok(r2.result)
  assert.equal(r2.result!.winner, 0)
  assert.deepEqual(r2.result!.made, [3, 2])
  assert.deepEqual(r2.result!.attempts, [4, 4])
})

test("shootout: el registro (log) queda en el orden real de los intentos, con quién tiró y si convirtió", () => {
  let s = initialShootout()
  for (const scored of [true, false, true, true, false, false]) {
    s = applyShootoutAttempt(s, scored).state
  }
  assert.deepEqual(s.log, [
    { side: 0, scored: true }, { side: 1, scored: false },
    { side: 0, scored: true }, { side: 1, scored: true },
    { side: 0, scored: false }, { side: 1, scored: false },
  ])
})
