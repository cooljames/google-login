/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import Board from './pages/Board';
import PostDetail from './pages/PostDetail';
import PostEditor from './pages/PostEditor';
import Admin from './pages/Admin';
import Profile from './pages/Profile';
import AuthContext from './components/AuthContext';

export default function App() {
  return (
    <AuthContext>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Landing />} />
            <Route path="board" element={<Board />} />
            <Route path="board/new" element={<PostEditor />} />
            <Route path="board/:id" element={<PostDetail />} />
            <Route path="board/edit/:id" element={<PostEditor />} />
            <Route path="admin" element={<Admin />} />
            <Route path="profile" element={<Profile />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthContext>
  );
}
