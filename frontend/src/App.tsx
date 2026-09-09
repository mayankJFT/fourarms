import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom';
import { ToastContainer } from './components/UI/ToastContainer';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/Layout/ProtectedRoute';
import { AdminPage } from './pages/AdminPage';
import { AuditLogPage } from './pages/AuditLogPage';
import { ChatPage } from './pages/ChatPage';
import { DashboardPage } from './pages/DashboardPage';
import { DocGenPage } from './pages/DocGenPage';
import { HRRecordsPage } from './pages/HRRecordsPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { RepositoryPage } from './pages/RepositoryPage';
import { WorkflowPage } from './pages/WorkflowPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to="/dashboard" replace />,
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/register',
    element: <RegisterPage />,
  },
  {
    path: '/dashboard',
    element: (
      <ProtectedRoute>
        <DashboardPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/chat',
    element: (
      <ProtectedRoute>
        <ChatPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/repository',
    element: (
      <ProtectedRoute>
        <RepositoryPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/generate',
    element: (
      <ProtectedRoute>
        <DocGenPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/workflow',
    element: (
      <ProtectedRoute>
        <WorkflowPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/hr',
    element: (
      <ProtectedRoute roles={['SUPER_ADMIN', 'BOARD_ADMIN', 'TENDER_AUTHOR']}>
        <HRRecordsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin',
    element: (
      <ProtectedRoute roles={['SUPER_ADMIN', 'BOARD_ADMIN']}>
        <AdminPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/audit',
    element: (
      <ProtectedRoute roles={['SUPER_ADMIN', 'BOARD_ADMIN']}>
        <AuditLogPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '*',
    element: <Navigate to="/dashboard" replace />,
  },
]);

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
        <ToastContainer />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
