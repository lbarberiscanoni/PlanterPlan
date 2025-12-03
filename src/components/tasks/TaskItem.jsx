import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { TaskShape } from '../../utils/shapes';

const TaskItem = ({
  task,
  level = 0,
  onTaskClick,
  selectedTaskId,
  onAddChildTask,
  canEdit = false,
  canDelete = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const hasChildren = task.children && task.children.length > 0;
  const indentWidth = level * 24;
  const isSelected = selectedTaskId === task.id;

  // Hierarchy: Project(0) > Phase(1) > Milestone(2) > Task(3) > Subtask(4)
  // Subtasks (level 4) cannot have children
  const canHaveChildren = level < 4;

  const getBackgroundColor = () => {
    if (level === 0) {
      return 'bg-gray-600';
    } else if (level === 1) {
      return 'bg-blue-600';
    } else if (level === 2) {
      return 'bg-blue-500';
    } else if (level === 3) {
      return 'bg-blue-400';
    } else {
      return 'bg-blue-300';
    }
  };

  const handleCardClick = (e) => {
    if (
      e.target.closest('.expand-button') ||
      e.target.closest('.status-icon') ||
      e.target.closest('.add-child-btn')
    ) {
      return;
    }
    if (onTaskClick) {
      onTaskClick(task);
    }
  };

  const handleAddChild = (e) => {
    e.stopPropagation();
    if (onAddChildTask) {
      onAddChildTask(task);
    }
  };

  return (
    <>
      <div
        className={`task-card ${getBackgroundColor()} ${isSelected ? 'selected' : ''}`}
        style={{ marginLeft: `${indentWidth}px` }}
        onClick={handleCardClick}
      >
        <div className="task-card-content">
          <div className="task-card-left">
            {canEdit && (
              <div className="drag-handle">
                <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
                  <circle cx="2" cy="2" r="1" fill="currentColor" />
                  <circle cx="6" cy="2" r="1" fill="currentColor" />
                  <circle cx="2" cy="7" r="1" fill="currentColor" />
                  <circle cx="6" cy="7" r="1" fill="currentColor" />
                  <circle cx="2" cy="12" r="1" fill="currentColor" />
                  <circle cx="6" cy="12" r="1" fill="currentColor" />
                </svg>
              </div>
            )}

            {hasChildren ? (
              <button onClick={() => setIsExpanded(!isExpanded)} className="expand-button">
                <svg
                  className={`expand-icon ${isExpanded ? 'expanded' : ''}`}
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="currentColor"
                >
                  <path d="M4.5 3L7.5 6L4.5 9V3Z" />
                </svg>
              </button>
            ) : (
              <div className="expand-spacer"></div>
            )}

            {task.is_complete ? (
              <div className="status-icon completed">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M10 3L4.5 8.5L2 6" />
                </svg>
              </div>
            ) : (
              <div className="status-icon incomplete"></div>
            )}
          </div>

          <div className="task-card-title">{task.title}</div>

          <div className="task-card-right">
            {canHaveChildren && onAddChildTask && (
              <button className="add-child-btn" onClick={handleAddChild} title="Add child task">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 2a1 1 0 011 1v4h4a1 1 0 110 2H9v4a1 1 0 11-2 0V9H3a1 1 0 110-2h4V3a1 1 0 011-1z" />
                </svg>
              </button>
            )}
            {canEdit && level === 0 && (
              <button className="dropdown-button">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M6 8L3 5h6l-3 3z" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {isExpanded && hasChildren && task.children && (
        <div className="task-children">
          {task.children.map((child) => (
            <TaskItem
              key={child.id}
              task={child}
              level={level + 1}
              onTaskClick={onTaskClick}
              selectedTaskId={selectedTaskId}
              onAddChildTask={onAddChildTask}
              canEdit={canEdit}
              canDelete={canDelete}
            />
          ))}
        </div>
      )}
    </>
  );
};

TaskItem.propTypes = {
  task: TaskShape.isRequired,
  level: PropTypes.number,
  onTaskClick: PropTypes.func,
  selectedTaskId: PropTypes.string,
  onAddChildTask: PropTypes.func,
  canEdit: PropTypes.bool,
  canDelete: PropTypes.bool,
};

export default TaskItem;
