import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],base:'./',build:{target:'es2022',chunkSizeWarningLimit:1200,rolldownOptions:{output:{codeSplitting:{groups:[{name:'map3d',test:/node_modules\/(three|@react-three|three-stdlib|camera-controls)/}]}}}}});
