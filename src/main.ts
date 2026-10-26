import './styles.css';
import { mountApp } from './app';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Không tìm thấy vùng hiển thị ứng dụng.');
const dispose = mountApp(root);
if (import.meta.hot) import.meta.hot.dispose(dispose);
