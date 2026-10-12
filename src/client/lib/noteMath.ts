// KaTeX and its plugins, in a chunk of their own: ReviewContent imports this only for a
// note that has math, so the other notes don't download and parse it.
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

export { remarkMath, rehypeKatex };
