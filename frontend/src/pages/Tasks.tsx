import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { Link } from 'react-router-dom';

interface Task {
  id: number;
  title: string;
  description?: string;
  priority: string;
  status: string;
  assigned_to?: number;
  assigned_to_name?: string;
  entity_type?: string;
  entity_id?: number;
  due_date?: string;
  follow_up_date?: string;
  task_type?: string;
  notes?: string;
  created_at: string;
}

interface User {
  id: number;
  name: string;
  email: string;
}

const priorityColors: Record<string, string> = {
  low: 'bg-gray-100 text-gray-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-red-100 text-red-800',
};

const taskTypeLabels: Record<string, string> = {
  manual: 'Manual',
  eicr_reminder: 'EICR',
  epc_reminder: 'EPC',
  gas_reminder: 'Gas Safety',
  tenancy_end: 'Tenancy End',
  rent_review: 'Rent Review',
  nok_missing: 'NOK Missing',
  follow_up: 'Follow Up',
};

export default function Tasks() {
  const api = useApi();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('active');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    title: '', description: '', priority: 'medium', assigned_to: '', due_date: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [tasksData, usersData] = await Promise.all([
        api.get('/tasks?status=active'),
        api.get('/users').catch(() => []) // May fail if not admin
      ]);
      setTasks(tasksData);
      setUsers(usersData);
    } catch (err) {
      console.error('Failed to load tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/tasks', {
        ...formData,
        assigned_to: formData.assigned_to ? parseInt(formData.assigned_to) : null,
        task_type: 'manual'
      });
      setShowForm(false);
      setFormData({ title: '', description: '', priority: 'medium', assigned_to: '', due_date: '' });
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to create task');
    }
  };

  const handleComplete = async (taskId: number) => {
    try {
      const task = tasks.find(t => t.id === taskId);
      if (task) {
        await api.put(`/tasks/${taskId}`, { ...task, status: 'completed' });
        loadData();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to complete task');
    }
  };

  const getEntityLink = (task: Task) => {
    if (!task.entity_type || !task.entity_id) return null;
    const links: Record<string, string> = {
      property: `/properties/${task.entity_id}`,
      tenant: `/tenants/${task.entity_id}`,
      landlord: `/landlords/${task.entity_id}`,
      enquiry: `/tenant-enquiries/${task.entity_id}`,
      maintenance: `/maintenance`,
    };
    return links[task.entity_type];
  };

  const isOverdue = (dueDate?: string) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  const isDueSoon = (dueDate?: string) => {
    if (!dueDate) return false;
    const due = new Date(dueDate);
    const today = new Date();
    const diff = (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 3;
  };

  if (loading) return <div className="p-6">Loading...</div>;

  const activeTasks = tasks.filter(t => t.status !== 'completed' && t.status !== 'archived');
  const highPriority = activeTasks.filter(t => t.priority === 'high');
  const overdue = activeTasks.filter(t => isOverdue(t.due_date));

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
          <p className="text-gray-600">To-do list and reminders</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="bg-[#102a43] text-white px-4 py-2 rounded hover:bg-[#1a3a5c]"
        >
          + Add Task
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">Active Tasks</div>
          <div className="text-2xl font-bold text-gray-900">{activeTasks.length}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">High Priority</div>
          <div className="text-2xl font-bold text-red-600">{highPriority.length}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">Overdue</div>
          <div className="text-2xl font-bold text-red-600">{overdue.length}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">Due Soon</div>
          <div className="text-2xl font-bold text-yellow-600">
            {activeTasks.filter(t => isDueSoon(t.due_date)).length}
          </div>
        </div>
      </div>

      {/* Tasks List */}
      <div className="bg-white rounded-lg shadow">
        <div className="divide-y divide-gray-200">
          {activeTasks.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No tasks. All caught up!</div>
          ) : (
            activeTasks.map(task => {
              const link = getEntityLink(task);
              return (
                <div key={task.id} className={`p-4 hover:bg-gray-50 ${isOverdue(task.due_date) ? 'bg-red-50' : ''}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => handleComplete(task.id)}
                        className="mt-1 w-5 h-5 border-2 rounded border-gray-300 hover:border-green-500 hover:bg-green-50 flex items-center justify-center"
                        title="Mark complete"
                      >
                        <span className="text-transparent hover:text-green-500">✓</span>
                      </button>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{task.title}</span>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${priorityColors[task.priority]}`}>
                            {task.priority}
                          </span>
                          {task.task_type && task.task_type !== 'manual' && (
                            <span className="px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-800">
                              {taskTypeLabels[task.task_type] || task.task_type}
                            </span>
                          )}
                        </div>
                        {task.description && (
                          <p className="text-sm text-gray-600 mt-1">{task.description}</p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                          {task.due_date && (
                            <span className={isOverdue(task.due_date) ? 'text-red-600 font-medium' : isDueSoon(task.due_date) ? 'text-yellow-600' : ''}>
                              Due: {new Date(task.due_date).toLocaleDateString()}
                            </span>
                          )}
                          {task.assigned_to_name && (
                            <span>Assigned to: {task.assigned_to_name}</span>
                          )}
                          {link && (
                            <Link to={link} className="text-[#102a43] hover:underline">
                              View {task.entity_type}
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Add Task Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Add Task</h2>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={e => setFormData({...formData, title: e.target.value})}
                    className="w-full border rounded px-3 py-2"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={e => setFormData({...formData, description: e.target.value})}
                    className="w-full border rounded px-3 py-2"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <select
                    value={formData.priority}
                    onChange={e => setFormData({...formData, priority: e.target.value})}
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={formData.due_date}
                    onChange={e => setFormData({...formData, due_date: e.target.value})}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
                {users.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Assign To</label>
                    <select
                      value={formData.assigned_to}
                      onChange={e => setFormData({...formData, assigned_to: e.target.value})}
                      className="w-full border rounded px-3 py-2"
                    >
                      <option value="">Unassigned</option>
                      {users.map(u => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 border rounded hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#102a43] text-white rounded hover:bg-[#1a3a5c]"
                >
                  Add Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
