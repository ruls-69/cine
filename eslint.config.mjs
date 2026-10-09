export default [{
  files: ['src/**/*.js'],
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: Object.fromEntries([
    'window','document','navigator','location','history','localStorage','sessionStorage','CSS','matchMedia',
    'fetch','URL','URLSearchParams','FormData','FileReader','Image','Event','CustomEvent',
    'MutationObserver','IntersectionObserver','ResizeObserver','HTMLElement','HTMLInputElement',
    'Node','crypto','confirm','alert','setTimeout','clearTimeout','setInterval','clearInterval',
    'requestAnimationFrame','cancelAnimationFrame','getComputedStyle','btoa','atob','console'
  ].map(name=>[name,'readonly'])) },
  rules: {
    'constructor-super': 'error', 'for-direction': 'error',
    'no-async-promise-executor': 'error', 'no-compare-neg-zero': 'error',
    'no-debugger': 'error', 'no-dupe-args': 'error', 'no-dupe-keys': 'error',
    'no-duplicate-case': 'error', 'no-invalid-regexp': 'error',
    'no-self-assign': 'error', 'no-sparse-arrays': 'error',
    'no-unexpected-multiline': 'error', 'no-unreachable': 'error',
    'valid-typeof': 'error', 'no-undef': 'error', 'no-unused-vars': 'error',
    'no-restricted-imports': ['error', { patterns: ['**/app/**'] }]
  }
}, {
  files: ['src/modules/**/*.js'],
  rules: {'no-restricted-globals': ['error', {name:'fetch',message:'Inject an application client or transport from src/app.'}]}
}];
