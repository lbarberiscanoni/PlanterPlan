// src/components/TaskForm/TaskForm.js - Updated with Tailwind CSS styling
import React, { useState } from 'react';
import { useTaskForm } from './useTaskForm';
import { formatDisplayDate } from '../../utils/taskUtils';
import URLTextComponent from '../URLTextComponent';
import MasterLibraryPicker from '../library/MasterLibraryPicker';
import ResourceCreateModal from '../library/ResourceCreateModal';

const TaskForm = ({ 
  parentTaskId,
  parentStartDate,
  onSubmit, 
  onCancel, 
  backgroundColor,
  originType = 'instance',
  initialData = null,
  isEditing = false  
}) => {
  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================
  
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [showResourceModal, setShowResourceModal] = useState(false);

  const {
    formData,
    errors,
    dateMode,
    handleDateModeChange,
    handleChange,
    handleDateChange,
    handleArrayChange,
    addArrayItem,
    removeArrayItem,
    validateForm,
    prepareFormData,
    setFormData
  } = useTaskForm(initialData, parentStartDate);

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================
  
  const getHeaderText = () => {
    if (isEditing) {
      return 'Edit Task';
    } else if (initialData) {
      return 'Edit Task';
    } else if (!parentTaskId) {
      return originType === 'template' ? 'Add Template' : 'Add Project';
    } else {
      return originType === 'template' ? 'Add Template Task' : 'Add Subtask';
    }
  };

// ============================================================================
// EVENT HANDLERS
// ============================================================================

  const handleCopyMasterLibraryTask = (templateTask) => {
    const parseArrayField = (field) => {
      if (Array.isArray(field)) return field.length > 0 ? field : [''];
      if (!field) return [''];
      if (typeof field === 'string') {
        try {
          const parsed = JSON.parse(field);
          return Array.isArray(parsed) ? (parsed.length > 0 ? parsed : ['']) : [field];
        } catch (e) {
          return [field];
        }
      }
      return [''];
    };

    setFormData(prev => {
      const next = { ...prev };

      if (!prev.title?.trim() && templateTask.title) {
        next.title = templateTask.title;
      }

      if (!prev.purpose?.trim() && templateTask.purpose) {
        next.purpose = templateTask.purpose;
      }

      if (!prev.description?.trim() && templateTask.description) {
        next.description = templateTask.description;
      }

      const currentActions = Array.isArray(prev.actions) ? prev.actions : [''];
      const hasActionContent = currentActions.some(item => item && item.toString().trim());
      if (!hasActionContent) {
        next.actions = parseArrayField(templateTask.actions);
      }

      const currentResources = Array.isArray(prev.resources) ? prev.resources : [''];
      const hasResourceContent = currentResources.some(item => item && item.toString().trim());
      if (!hasResourceContent) {
        next.resources = parseArrayField(templateTask.resources);
      }

      const templateDuration = templateTask.default_duration || templateTask.duration_days;
      const hasExistingDuration = prev.duration_days !== undefined && prev.duration_days !== null && prev.duration_days !== '';
      const shouldReplaceDuration = !hasExistingDuration || (!isEditing && !initialData?.duration_days && Number(prev.duration_days) === 1);
      if (templateDuration && shouldReplaceDuration) {
        next.duration_days = templateDuration;
      }

      const existingDaysOffset = prev.days_from_start_until_due;
      const hasExistingOffset = existingDaysOffset !== undefined && existingDaysOffset !== null && existingDaysOffset !== '';
      if (!hasExistingOffset && templateTask.days_from_start_until_due !== undefined) {
        next.days_from_start_until_due = templateTask.days_from_start_until_due;
      }

      return next;
    });
    setIsLibraryOpen(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (validateForm()) {
      const cleanedData = prepareFormData();
      
      onSubmit({
        ...cleanedData,
        parent_task_id: parentTaskId,
        origin: originType,
        is_complete: formData.is_complete !== undefined ? formData.is_complete : false
      });
    }
  };

  // ============================================================================
  // COMPUTED VALUES
  // ============================================================================
  
  const safeActions = Array.isArray(formData.actions) ? formData.actions : [''];
  const safeResources = Array.isArray(formData.resources) ? formData.resources : [''];

  // ============================================================================
  // RENDER COMPONENTS
  // ============================================================================
  
  const renderHeader = () => (
    <div
      className="text-white p-4 rounded-t flex justify-between items-center"
      style={{ backgroundColor: backgroundColor }}
    >
      <h3 className="m-0 font-bold text-lg">
        {getHeaderText()}
      </h3>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setIsLibraryOpen(prev => !prev)}
          className="bg-white bg-opacity-20 border border-white border-opacity-30 rounded text-white px-3 py-1.5 text-xs font-medium flex items-center gap-1 transition-colors hover:bg-white hover:bg-opacity-30"
          title="Search Master Library templates to copy"
        >
          <span>🔍</span>
          <span>{isLibraryOpen ? 'Hide Library Picker' : 'Copy from Library'}</span>
        </button>

        <button
          onClick={onCancel}
          className="bg-white bg-opacity-20 border-none rounded-full text-white w-6 h-6 flex items-center justify-center text-xs cursor-pointer hover:bg-white hover:bg-opacity-30 transition-colors"
        >
          ✕
        </button>
      </div>
    </div>
  );

  const renderTitleField = () => (
    <div className="mb-4">
      <label htmlFor="title" className="block font-bold mb-1 text-gray-900">
        Title *
      </label>
      <input
        id="title"
        name="title"
        type="text"
        value={formData.title || ''}
        onChange={handleChange}
        className={`
          w-full px-2 py-2 rounded border outline-none transition-colors
          ${errors.title 
            ? 'border-red-500 focus:border-red-600' 
            : 'border-gray-300 focus:border-blue-500'
          }
        `}
        placeholder="Enter task title"
      />
      {errors.title && (
        <p className="text-red-500 text-xs mt-1">{errors.title}</p>
      )}
    </div>
  );

  const renderScheduleSection = () => (
    <div className="mb-4 p-3 bg-gray-100 rounded">
      <div className="mb-3">
        <label htmlFor="duration_days" className="block font-bold mb-1 text-gray-900">
          Duration (days)
        </label>
        <input
          id="duration_days"
          name="duration_days"
          type="number"
          min="1"
          value={formData.duration_days || 1}
          onChange={handleChange}
          className="w-20 px-2 py-2 rounded border border-gray-300 outline-none focus:border-blue-500"
        />
        
        {formData.start_date && formData.due_date && (
          <div className="mt-3 text-sm text-gray-600 bg-gray-50 p-2 rounded">
            <div><strong>Start Date:</strong> {formatDisplayDate(formData.start_date)}</div>
            <div><strong>End Date:</strong> {formatDisplayDate(formData.due_date)}</div>
            <div className="mt-1 text-xs italic">
              Note: Changing duration will update the end date accordingly.
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderTextAreaField = (name, label, rows = 2, placeholder = '') => (
    <div className="mb-4">
      <label htmlFor={name} className="block font-bold mb-1 text-gray-900">
        {label}
      </label>
      <textarea
        id={name}
        name={name}
        value={formData[name] || ''}
        onChange={handleChange}
        rows={rows}
        className="w-full px-2 py-2 rounded border border-gray-300 outline-none resize-y focus:border-blue-500"
        placeholder={placeholder}
      />
    </div>
  );

  const renderArrayField = (type, label, placeholder, isResourceField = false) => (
    <div className="mb-4">
      <label className="block font-bold mb-1 text-gray-900">{label}</label>
      <div className="space-y-2">
        {(type === 'actions' ? safeActions : safeResources).map((item, index) => (
          <div key={`${type}-${index}`} className="flex items-start gap-2">
            {isResourceField ? (
              <URLTextComponent
                value={item || ''}
                onChange={(newValue) => handleArrayChange(type, index, newValue)}
                placeholder={placeholder}
                style={{ flex: 1 }}
              />
            ) : (
              <input
                type="text"
                value={item || ''}
                onChange={(e) => handleArrayChange(type, index, e.target.value)}
                className="flex-1 px-2 py-2 rounded border border-gray-300 outline-none focus:border-blue-500"
                placeholder={placeholder}
              />
            )}
            <button
              type="button"
              onClick={() => removeArrayItem(type, index)}
              className={`px-2 py-2 rounded border-none bg-gray-100 cursor-pointer hover:bg-gray-200 transition-colors ${isResourceField ? 'mt-2' : ''}`}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => addArrayItem(type)}
          className="px-2 py-1 rounded border border-gray-300 bg-white cursor-pointer flex items-center text-xs gap-1 hover:bg-gray-50 transition-colors"
        >
          <span>Add {label.slice(0, -1)}</span>
          <span>+</span>
        </button>
      </div>
    </div>
  );

  const renderFormButtons = () => (
    <div className="flex justify-end gap-3">
      <button
        type="button"
        onClick={onCancel}
        className="px-4 py-2 rounded border border-gray-300 bg-white cursor-pointer hover:bg-gray-50 transition-colors"
      >
        Cancel
      </button>
      <button
        type="submit"
        className="px-4 py-2 rounded border-none bg-green-600 text-white cursor-pointer hover:bg-green-700 transition-colors"
      >
        {isEditing || initialData ? 'Update Task' : 'Add Task'}
      </button>
    </div>
  );

  // ============================================================================
  // MAIN RENDER
  // ============================================================================
  
  const renderLibrarySection = () => (
    <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-blue-900">Search &amp; pick from Master Library</p>
        <button
          type="button"
          onClick={() => setIsLibraryOpen(prev => !prev)}
          className="text-sm font-medium text-blue-700 hover:text-blue-800"
        >
          {isLibraryOpen ? 'Hide' : 'Show'}
        </button>
      </div>
      {isLibraryOpen && (
        <div className="mt-3">
          <MasterLibraryPicker
            onPick={handleCopyMasterLibraryTask}
            onCreateNew={() => setShowResourceModal(true)}
            autoFocus={isLibraryOpen}
          />
        </div>
      )}
    </div>
  );

  return (
    <>
      <div className="bg-gray-50 rounded border border-gray-200 h-full overflow-auto">
        {renderHeader()}

        <form onSubmit={handleSubmit} className="p-4">
          {renderLibrarySection()}
          {renderTitleField()}
          {renderScheduleSection()}
          {renderTextAreaField('purpose', 'Purpose', 2, 'What is the purpose of this task?')}
          {renderTextAreaField('description', 'Description', 3, 'Describe this task')}
          {renderArrayField('actions', 'Actions', 'Enter an action step')}
          {renderArrayField('resources', 'Resources', 'Enter a resource (URLs will be automatically detected)', true)}
          {renderFormButtons()}
        </form>
      </div>

      <ResourceCreateModal isOpen={showResourceModal} onClose={() => setShowResourceModal(false)} />
    </>
  );
};

export default TaskForm;