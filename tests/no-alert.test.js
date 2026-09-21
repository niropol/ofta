// Guardia: el panel embebido (y varios navegadores) NO muestran alert()/confirm().
// El usuario hacía clic y "no pasaba nada". Toda la feedback debe pasar por los
// diálogos in-app (avisoUI / confirmarUI). Este test evita que se reintroduzca
// un alert()/confirm() nativo por descuido.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const JS_DIR = join(__dirname, '..', 'js');

// ui-dialogos.js contiene los reemplazos y sus últimos respaldos (alert nativo
// como red de seguridad si faltara el modal): se permite solo ahí.
const PERMITIDOS = new Set(['ui-dialogos.js']);

describe('Sin diálogos nativos (alert/confirm) en la UI', () => {
  const archivos = readdirSync(JS_DIR).filter(f => f.endsWith('.js'));

  for (const f of archivos) {
    if (PERMITIDOS.has(f)) continue;
    it(`${f} no usa alert()/confirm() nativos`, () => {
      const src = readFileSync(join(JS_DIR, f), 'utf8');
      // \b evita cazar avisoUI/confirmarUI; permitimos window.confirm dentro de
      // confirmarUI si alguien lo moviera, pero acá no debería haber ninguno.
      const alerts = src.match(/(?<![.\w])alert\s*\(/g) || [];
      const confirms = src.match(/(?<![.\w])confirm\s*\(/g) || [];
      expect(alerts, `alert() nativo en ${f}`).toHaveLength(0);
      expect(confirms, `confirm() nativo en ${f}`).toHaveLength(0);
    });
  }
});
