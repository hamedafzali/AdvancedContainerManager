import React from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

interface SortableItemProps {
  id: string;
  children: React.ReactNode;
  className?: string;
}

function SortableItem({ id, children, className = '' }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${className} ${isDragging ? 'z-50' : ''}`}
    >
      <div className="flex items-center group">
        <button
          {...attributes}
          {...listeners}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 cursor-grab active:cursor-grabbing"
          aria-label="Drag to reorder"
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <div className="flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}

interface SortableListProps {
  items: Array<{ id: string; content: React.ReactNode; className?: string }>;
  onReorder: (newOrder: Array<{ id: string; content: React.ReactNode; className?: string }>) => void;
  className?: string;
}

export function SortableList({ items, onReorder, className = '' }: SortableListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);

      const newItems = arrayMove(items, oldIndex, newIndex);
      onReorder(newItems);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={items.map(item => item.id)} strategy={verticalListSortingStrategy}>
        <div className={className}>
          {items.map((item) => (
            <SortableItem key={item.id} id={item.id} className={item.className}>
              {item.content}
            </SortableItem>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

// Hook for managing sortable dashboard widgets
export function useSortableDashboard() {
  const [widgets, setWidgets] = React.useState([
    {
      id: 'metrics-cards',
      content: null, // Will be populated with actual content
      className: 'mb-8'
    },
    {
      id: 'charts',
      content: null,
      className: 'mb-8'
    },
    {
      id: 'ai-suggestions',
      content: null,
      className: 'mb-8'
    },
    {
      id: 'quick-actions',
      content: null,
      className: 'mb-8'
    },
    {
      id: 'activity-feed',
      content: null,
      className: ''
    }
  ]);

  const reorderWidgets = (newOrder: typeof widgets) => {
    setWidgets(newOrder);
    // Persist to localStorage
    localStorage.setItem('dashboard-widget-order', JSON.stringify(newOrder.map(w => w.id)));
  };

  // Load saved order on mount
  React.useEffect(() => {
    const savedOrder = localStorage.getItem('dashboard-widget-order');
    if (savedOrder) {
      try {
        const order = JSON.parse(savedOrder);
        const reorderedWidgets = order.map((id: string) =>
          widgets.find(w => w.id === id)
        ).filter(Boolean);
        if (reorderedWidgets.length === widgets.length) {
          setWidgets(reorderedWidgets);
        }
      } catch (error) {
        console.warn('Failed to load saved dashboard widget order:', error);
      }
    }
  }, []);

  return {
    widgets,
    reorderWidgets
  };
}
