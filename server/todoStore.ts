export type TodoRecord = {
  id: number;
  title: string;
  description: string | null;
  completed: boolean;
  createdAt: Date;
  updatedAt: Date;
};

let nextId = 1;
const todos: TodoRecord[] = [];

export function listMemoryTodos() {
  return [...todos].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function createMemoryTodo(title: string, description?: string | null) {
  const now = new Date();
  const todo: TodoRecord = {
    id: nextId++,
    title,
    description: description || null,
    completed: false,
    createdAt: now,
    updatedAt: now,
  };
  todos.unshift(todo);
  return todo;
}

export function toggleMemoryTodo(id: number, completed: boolean) {
  const todo = todos.find((item) => item.id === id);
  if (!todo) return undefined;
  todo.completed = completed;
  todo.updatedAt = new Date();
  return todo;
}

export function deleteMemoryTodo(id: number) {
  const index = todos.findIndex((item) => item.id === id);
  if (index < 0) return false;
  todos.splice(index, 1);
  return true;
}
