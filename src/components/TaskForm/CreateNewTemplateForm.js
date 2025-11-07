// src/components/TaskForm/CreateNewTemplateForm.js
import React, { useState } from 'react';
import MasterLibraryPicker from '../library/MasterLibraryPicker';
import ResourceCreateModal from '../library/ResourceCreateModal';

const CreateNewTemplateForm = ({ 
  onSubmit, 
  onCancel, 
  backgroundColor = '#3b82f6'
}) => {
  // Simple state management for new template creation
  const [formData, setFormData] = useState({
    title: '',
    purpose: '',
    description: '',
    actions: [''],
    resources: [''],
    duration_days: 1
  });

  const [errors, setErrors] = useState({});
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [showResourceModal, setShowResourceModal] = useState(false);

  // Handle basic input changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear error for this field if it exists
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = {...prev};
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  // Handle array field changes
  const handleArrayChange = (type, index, value) => {
    setFormData(prev => {
      const newArray = [...prev[type]];
      newArray[index] = value;
      return {
        ...prev,
        [type]: newArray
      };
    });
  };

  // Add new array item
  const addArrayItem = (type) => {
    setFormData(prev => ({
      ...prev,
      [type]: [...prev[type], '']
    }));
  };

  // Remove array item
  const removeArrayItem = (type, index) => {
    setFormData(prev => {
      const newArray = [...prev[type]];
      newArray.splice(index, 1);
      return {
        ...prev,
        [type]: newArray.length === 0 ? [''] : newArray
      };
    });
  };

  const handleLibraryPick = (templateTask) => {
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

      const hasActionContent = prev.actions.some(item => item && item.toString().trim());
      if (!hasActionContent) {
        next.actions = parseArrayField(templateTask.actions);
      }

      const hasResourceContent = prev.resources.some(item => item && item.toString().trim());
      if (!hasResourceContent) {
        next.resources = parseArrayField(templateTask.resources);
      }

      const templateDuration = templateTask.default_duration || templateTask.duration_days;
      const hasExistingDuration = prev.duration_days !== undefined && prev.duration_days !== null && prev.duration_days !== '';
      if (templateDuration && (!hasExistingDuration || Number(prev.duration_days) === 1)) {
        next.duration_days = templateDuration;
      }

      return next;
    });

    setIsLibraryOpen(false);
  };

  // Form validation
  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.title?.trim()) {
      newErrors.title = 'Title is required';
    }
    
    if (!formData.duration_days || formData.duration_days < 1) {
      newErrors.duration_days = 'Duration must be at least 1 day';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Prepare data for submission
  const prepareFormData = () => {
    return {
      ...formData,
      actions: formData.actions.filter(item => item && item.trim() !== ''),
      resources: formData.resources.filter(item => item && item.trim() !== ''),
      duration_days: parseInt(formData.duration_days, 10),
      origin: 'template',
      is_complete: false,
      parent_task_id: null // Always null for new top-level templates
    };
  };

  // Handle form submission
  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (validateForm()) {
      const cleanedData = prepareFormData();
      onSubmit(cleanedData);
    }
  };

  return (
    <div style={{
      backgroundColor: '#f9fafb',
      borderRadius: '4px',
      border: '1px solid #e5e7eb',
      height: '100%',
      overflow: 'auto'
    }}>
      {/* Header */}
      <div style={{
        backgroundColor: backgroundColor,
        color: 'white',
        padding: '16px',
        borderTopLeftRadius: '4px',
        borderTopRightRadius: '4px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h3 style={{ margin: 0, fontWeight: 'bold' }}>
          Create New Template
        </h3>
        <button 
          onClick={onCancel}
          style={{
            background: 'rgba(255, 255, 255, 0.2)',
            border: 'none',
            borderRadius: '50%',
            color: 'white',
            cursor: 'pointer',
            width: '24px',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px'
          }}
        >
          ✕
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} style={{ padding: '16px' }}>
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
                onPick={handleLibraryPick}
                onCreateNew={() => setShowResourceModal(true)}
                autoFocus={isLibraryOpen}
              />
            </div>
          )}
        </div>

        {/* Title Field */}
        <div style={{ marginBottom: '16px' }}>
          <label
            htmlFor="title"
            style={{
              display: 'block', 
              fontWeight: 'bold', 
              marginBottom: '4px' 
            }}
          >
            Template Title *
          </label>
          <input
            id="title"
            name="title"
            type="text"
            value={formData.title}
            onChange={handleChange}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '4px',
              border: `1px solid ${errors.title ? '#ef4444' : '#d1d5db'}`,
              outline: 'none'
            }}
          />
          {errors.title && (
            <p style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px' }}>
              {errors.title}
            </p>
          )}
        </div>
        
        {/* Duration Field */}
        <div style={{ marginBottom: '16px' }}>
          <label 
            htmlFor="duration_days"
            style={{ 
              display: 'block', 
              fontWeight: 'bold', 
              marginBottom: '4px' 
            }}
          >
            Duration (days)
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              id="duration_days"
              name="duration_days"
              type="number"
              min="1"
              value={formData.duration_days}
              onChange={handleChange}
              style={{
                width: '80px',
                padding: '8px',
                borderRadius: '4px',
                border: `1px solid ${errors.duration_days ? '#ef4444' : '#d1d5db'}`,
                outline: 'none'
              }}
            />
            <span style={{ fontSize: '14px', color: '#6b7280' }}>days</span>
          </div>
          {errors.duration_days && (
            <p style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px' }}>
              {errors.duration_days}
            </p>
          )}
        </div>
        
        {/* Purpose Field */}
        <div style={{ marginBottom: '16px' }}>
          <label 
            htmlFor="purpose"
            style={{ 
              display: 'block', 
              fontWeight: 'bold', 
              marginBottom: '4px' 
            }}
          >
            Purpose
          </label>
          <textarea
            id="purpose"
            name="purpose"
            value={formData.purpose}
            onChange={handleChange}
            rows={2}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #d1d5db',
              outline: 'none',
              resize: 'vertical'
            }}
          />
        </div>
        
        {/* Description Field */}
        <div style={{ marginBottom: '16px' }}>
          <label 
            htmlFor="description"
            style={{ 
              display: 'block', 
              fontWeight: 'bold', 
              marginBottom: '4px' 
            }}
          >
            Description
          </label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleChange}
            rows={3}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #d1d5db',
              outline: 'none',
              resize: 'vertical'
            }}
          />
        </div>
        
        {/* Actions Array */}
        <div style={{ marginBottom: '16px' }}>
          <label 
            style={{ 
              display: 'block', 
              fontWeight: 'bold', 
              marginBottom: '4px' 
            }}
          >
            Actions
          </label>
          {formData.actions.map((action, index) => (
            <div key={`action-${index}`} style={{ 
              display: 'flex', 
              marginBottom: '8px',
              alignItems: 'center' 
            }}>
              <input
                type="text"
                value={action}
                onChange={(e) => handleArrayChange('actions', index, e.target.value)}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid #d1d5db',
                  outline: 'none'
                }}
                placeholder="Enter an action step"
              />
              <button
                type="button"
                onClick={() => removeArrayItem('actions', index)}
                style={{
                  marginLeft: '8px',
                  padding: '8px',
                  borderRadius: '4px',
                  border: 'none',
                  background: '#f3f4f6',
                  cursor: 'pointer'
                }}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => addArrayItem('actions')}
            style={{
              padding: '4px 8px',
              borderRadius: '4px',
              border: '1px solid #d1d5db',
              background: 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              fontSize: '12px'
            }}
          >
            <span style={{ marginRight: '4px' }}>Add Action</span>
            <span>+</span>
          </button>
        </div>
        
        {/* Resources Array */}
        <div style={{ marginBottom: '24px' }}>
          <label 
            style={{ 
              display: 'block', 
              fontWeight: 'bold', 
              marginBottom: '4px' 
            }}
          >
            Resources
          </label>
          {formData.resources.map((resource, index) => (
            <div key={`resource-${index}`} style={{ 
              display: 'flex', 
              marginBottom: '8px',
              alignItems: 'center' 
            }}>
              <input
                type="text"
                value={resource}
                onChange={(e) => handleArrayChange('resources', index, e.target.value)}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid #d1d5db',
                  outline: 'none'
                }}
                placeholder="Enter a resource"
              />
              <button
                type="button"
                onClick={() => removeArrayItem('resources', index)}
                style={{
                  marginLeft: '8px',
                  padding: '8px',
                  borderRadius: '4px',
                  border: 'none',
                  background: '#f3f4f6',
                  cursor: 'pointer'
                }}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => addArrayItem('resources')}
            style={{
              padding: '4px 8px',
              borderRadius: '4px',
              border: '1px solid #d1d5db',
              background: 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              fontSize: '12px'
            }}
          >
            <span style={{ marginRight: '4px' }}>Add Resource</span>
            <span>+</span>
          </button>
        </div>
        
        {/* Form Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '8px 16px',
              borderRadius: '4px',
              border: '1px solid #d1d5db',
              background: 'white',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            style={{
              padding: '8px 16px',
              borderRadius: '4px',
              border: 'none',
              background: '#10b981',
              color: 'white',
              cursor: 'pointer'
            }}
          >
            Create Template
          </button>
        </div>
      </form>

      <ResourceCreateModal
        isOpen={showResourceModal}
        onClose={() => setShowResourceModal(false)}
      />
    </div>
  );
};

export default CreateNewTemplateForm;
