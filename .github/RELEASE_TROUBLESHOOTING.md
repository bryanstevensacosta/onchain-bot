# Release-Please Troubleshooting

## 🔍 Problema: Release-Please Bloqueado

### Síntoma

Los merges a `master` no generan releases automáticamente. El workflow `release-please.yml` corre exitosamente pero no crea tags ni releases.

### Diagnóstico

1. Ve a: https://github.com/bryanstevensacosta/onchain-bot/actions/workflows/release-please.yml
2. Abre el último workflow run
3. Busca en los logs: `⚠ There are untagged, merged release PRs outstanding - aborting`

Si ves ese mensaje, release-please está **BLOQUEADO**.

### Causa Raíz

Un PR de release (generado por release-please) fue mergeado a `master`, pero:

- El tag NO se creó en el commit del merge
- El release NO se creó en GitHub
- Release-please detecta esto y se niega a crear nuevos releases hasta que se arregle

### Solución Manual

#### Paso 1: Identificar el PR bloqueador

```bash
# Buscar en los logs del workflow el número del PR
# Ejemplo: "Found pull request #66: 'chore: release master'"
PR_NUMBER=66  # Reemplazar con el número real
```

#### Paso 2: Obtener el merge commit correcto

```bash
gh pr view $PR_NUMBER --json mergeCommit --jq '.mergeCommit.oid'
# Output ejemplo: a4ba173485f8a00b8d3a3ba1ee6dc886d9dff25e
```

#### Paso 3: Identificar la versión esperada

```bash
gh pr view $PR_NUMBER --json body --jq '.body' | grep -A 1 "<summary>"
# Output ejemplo: <summary>1.3.2</summary>
TAG_VERSION="v1.3.2"  # Reemplazar con la versión real
```

#### Paso 4: Verificar si el tag existe y dónde apunta

```bash
gh api repos/bryanstevensacosta/onchain-bot/git/refs/tags/$TAG_VERSION --jq '.object.sha'
```

#### Paso 5: Arreglar el tag y release

```bash
#!/bin/bash
set -e

# Configuración
TAG="v1.3.2"  # De Paso 3
CORRECT_COMMIT="a4ba173485f8a00b8d3a3ba1ee6dc886d9dff25e"  # De Paso 2
PR_NUMBER=66  # De Paso 1

echo "🔧 Fixing release-please blockage..."

# 1. Eliminar tag incorrecto (si existe)
gh api -X DELETE repos/bryanstevensacosta/onchain-bot/git/refs/tags/${TAG} 2>/dev/null || echo "Tag doesn't exist, skipping delete"

# 2. Crear tag en el commit correcto
gh api repos/bryanstevensacosta/onchain-bot/git/refs \
  -X POST \
  -f ref="refs/tags/${TAG}" \
  -f sha="${CORRECT_COMMIT}"

# 3. Crear el GitHub Release
PR_BODY=$(gh pr view $PR_NUMBER --json body --jq '.body')
gh release create "${TAG}" \
  --target "${CORRECT_COMMIT}" \
  --title "${TAG}" \
  --notes "${PR_BODY}" \
  --latest

echo "✅ Release fixed! Verify at:"
echo "https://github.com/bryanstevensacosta/onchain-bot/releases/tag/${TAG}"
```

#### Paso 6: Verificar que el bloqueo se resolvió

```bash
# El tag debe apuntar al commit correcto del merge
gh api repos/bryanstevensacosta/onchain-bot/git/refs/tags/$TAG_VERSION --jq '.object.sha'

# El release debe existir y apuntar al mismo commit
gh release view $TAG_VERSION --json targetCommitish --jq '.targetCommitish'
```

#### Paso 7: Trigger manual del workflow

```bash
gh workflow run release-please.yml
```

Espera 1-2 minutos y verifica que el workflow:

- ✅ NO muestra el mensaje de bloqueo
- ✅ Crea un nuevo PR de release (si hay commits desde el último release)
- ✅ O muestra "No releases created" (normal si no hay nuevos commits)

## 🛡️ Prevención

### Workflow Mejorado

El workflow `release-please.yml` ahora incluye:

1. **Outputs extendidos**: Expone los tags creados para verificación
2. **Job de verificación**: Alerta si no se crean releases (podría indicar bloqueo)
3. **Logs mejorados**: Mensajes claros sobre qué esperar en cada escenario

### Proceso de Release Correcto

1. **Hacer cambios en `dev`** con commits convencionales (`feat:`, `fix:`, etc.)
2. **Merge a `master`** → release-please crea un PR automáticamente
3. **Revisar el PR de release** (título: `chore: release master`)
4. **Merge del PR de release** → release-please crea tag + GitHub Release automáticamente
5. **Verificar** que el release aparece en: https://github.com/bryanstevensacosta/onchain-bot/releases

### Red Flags 🚩

Si alguno de estos ocurre, revisa inmediatamente:

- ❌ Mergeaste un PR `chore: release master` pero no se creó el tag
- ❌ Mergeaste a `master` hace días pero no hay PR de release nuevo
- ❌ El workflow `release-please.yml` muestra `releases_created: false` después de mergear un PR de release

### Commits Convencionales

Release-please requiere commits con prefijos específicos:

```
feat:     Nueva funcionalidad (bump MINOR)
fix:      Bug fix (bump PATCH)
perf:     Performance improvement (bump PATCH)
chore:    Mantenimiento (NO genera release)
docs:     Documentación (NO genera release)
style:    Formato (NO genera release)
refactor: Refactor (NO genera release)
test:     Tests (NO genera release)
ci:       CI/CD (NO genera release)
```

**BREAKING CHANGE** en el body → bump MAJOR

## 📚 Referencias

- [Release Please Documentation](https://github.com/googleapis/release-please)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Workflow Logs](https://github.com/bryanstevensacosta/onchain-bot/actions/workflows/release-please.yml)
