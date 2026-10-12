// The HTML parser behind raw tags in a note (<mark>, <img>, <br>), in a chunk of its own:
// ReviewContent imports this only for a note that has HTML.
export { default as rehypeRaw } from 'rehype-raw';
