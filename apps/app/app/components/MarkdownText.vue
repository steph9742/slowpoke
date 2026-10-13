<script setup lang="ts">
import { computed } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

// RENDU MARKDOWN — pour les textes qui viennent d'ailleurs (descriptions d'un SOC, par exemple).
//
// ⚠️ CE TEXTE N'EST PAS DE CONFIANCE : un ticket DÉCRIT UNE ATTAQUE, et cite le corps d'un
// courriel d'hameçonnage, des adresses malveillantes, parfois du contenu écrit par l'attaquant.
// D'où :
//   - `marked` NE PROTÈGE DE RIEN : il recopie tel quel `<script>`, `<img onerror=…>`,
//     `<iframe>` et les liens `javascript:`. DOMPurify est la SEULE barrière ;
//   - la liste des balises et attributs autorisés est fermée, pas ouverte ;
//   - AUCUNE image : un pixel distant signalerait à qui l'a déposé le moment de la consultation ;
//   - les liens ne sont pas cliquables — la balise `a` tombe, son texte reste.

const props = defineProps<{ texte?: string | null }>()

const BALISES = [
  'p', 'br', 'hr', 'strong', 'em', 'del', 'code', 'pre',
  'ul', 'ol', 'li', 'blockquote',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
]

const html = computed(() => {
  const brut = props.texte?.trim()
  if (!brut) return ''
  // `async: false` garantit une chaîne : `marked` peut rendre une promesse sinon.
  const rendu = marked.parse(brut, { async: false, gfm: true, breaks: true }) as string
  return DOMPurify.sanitize(rendu, {
    ALLOWED_TAGS: BALISES,
    // Aucun attribut : ni href, ni style, ni class. Le texte d'un lien reste visible,
    // sa cible ne part nulle part.
    ALLOWED_ATTR: [],
    FORBID_TAGS: ['img', 'a', 'script', 'style', 'iframe', 'form', 'input'],
  })
})
</script>

<template>
  <ClientOnly>
    <!-- eslint-disable-next-line vue/no-v-html -- contenu nettoyé par DOMPurify juste au-dessus, liste de balises fermée et sans attributs -->
    <div
      v-if="html"
      class="markdown text-sm text-text/90 leading-relaxed break-words"
      v-html="html"
    />
    <template #fallback>
      <p class="whitespace-pre-wrap break-words text-sm text-text/90 leading-relaxed">
        {{ texte }}
      </p>
    </template>
  </ClientOnly>
</template>

<style scoped>
/* Le projet n'a pas de plugin typographique : les quelques règles nécessaires suffisent. */
.markdown :deep(p) { margin-block: 0.5rem; }
.markdown :deep(p:first-child) { margin-top: 0; }
.markdown :deep(p:last-child) { margin-bottom: 0; }
.markdown :deep(ul), .markdown :deep(ol) { margin-block: 0.5rem; padding-left: 1.25rem; }
.markdown :deep(ul) { list-style: disc; }
.markdown :deep(ol) { list-style: decimal; }
.markdown :deep(li) { margin-block: 0.15rem; }
.markdown :deep(h1), .markdown :deep(h2), .markdown :deep(h3),
.markdown :deep(h4), .markdown :deep(h5), .markdown :deep(h6) {
  font-weight: 600;
  margin-block: 0.75rem 0.35rem;
}
.markdown :deep(h1) { font-size: 1.05rem; }
.markdown :deep(h2) { font-size: 1rem; }
.markdown :deep(h3), .markdown :deep(h4) { font-size: 0.925rem; }
.markdown :deep(code) {
  font-family: var(--font-mono, monospace);
  font-size: 0.85em;
  padding: 0.1em 0.35em;
  border-radius: 0.25rem;
  background: color-mix(in oklch, currentColor 8%, transparent);
}
.markdown :deep(pre) {
  margin-block: 0.5rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
  overflow-x: auto;
  background: color-mix(in oklch, currentColor 6%, transparent);
}
.markdown :deep(pre code) { background: none; padding: 0; }
.markdown :deep(blockquote) {
  margin-block: 0.5rem;
  padding-left: 0.75rem;
  border-left: 3px solid color-mix(in oklch, currentColor 20%, transparent);
  opacity: 0.9;
}
.markdown :deep(table) { margin-block: 0.5rem; border-collapse: collapse; display: block; overflow-x: auto; }
.markdown :deep(th), .markdown :deep(td) {
  border: 1px solid color-mix(in oklch, currentColor 15%, transparent);
  padding: 0.25rem 0.5rem;
  text-align: left;
}
.markdown :deep(hr) { margin-block: 0.75rem; border-color: color-mix(in oklch, currentColor 15%, transparent); }
</style>
