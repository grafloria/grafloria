/**
 * Unit tests for Property Schema Types
 *
 * Following TDD approach - tests written first, then implementation
 */

import {
  PropertyDefinition,
  PropertyEditorType,
  StringPropertyDefinition,
  NumberPropertyDefinition,
  BooleanPropertyDefinition,
  SelectPropertyDefinition,
  MultiSelectPropertyDefinition,
  ColorPropertyDefinition,
  TextAreaPropertyDefinition,
  JsonPropertyDefinition,
  DatePropertyDefinition,
  DateTimePropertyDefinition,
  SliderPropertyDefinition,
  FilePropertyDefinition,
  SelectOption,
  PropertyValidation,
  ValidationError,
  ValidationResult,
  PropertyCondition,
  ConditionOperator,
  ComplexPropertyCondition,
  PropertyGroup,
  PropertySchema,
} from './index';

describe('Property Schema Types', () => {
  describe('PropertyDefinition', () => {
    it('should have required fields', () => {
      const def: PropertyDefinition = {
        key: 'tableName',
        label: 'Table Name',
        editor: 'string',
      };
      expect(def.key).toBe('tableName');
      expect(def.label).toBe('Table Name');
      expect(def.editor).toBe('string');
    });

    it('should allow optional fields', () => {
      const def: PropertyDefinition = {
        key: 'columns',
        label: 'Columns',
        editor: 'json',
        description: 'Table column definitions',
        validation: { required: true },
        group: 'schema',
      };
      expect(def.description).toBeDefined();
      expect(def.validation).toBeDefined();
      expect(def.group).toBe('schema');
    });

    it('should allow all optional fields', () => {
      const def: PropertyDefinition = {
        key: 'test',
        label: 'Test',
        editor: 'string',
        defaultValue: 'default',
        description: 'Test property',
        validation: { required: true },
        condition: { property: 'enabled', operator: '==', value: true },
        group: 'basic',
        order: 1,
      };
      expect(def.defaultValue).toBe('default');
      expect(def.description).toBe('Test property');
      expect(def.validation?.required).toBe(true);
      expect(def.condition?.property).toBe('enabled');
      expect(def.group).toBe('basic');
      expect(def.order).toBe(1);
    });
  });

  describe('PropertyEditorType', () => {
    it('should support all 12 editor types', () => {
      const editorTypes: PropertyEditorType[] = [
        'string',
        'number',
        'boolean',
        'select',
        'multiselect',
        'color',
        'textarea',
        'json',
        'date',
        'datetime',
        'slider',
        'file',
      ];
      expect(editorTypes).toHaveLength(12);
    });

    it('should support string editor', () => {
      const def: StringPropertyDefinition = {
        key: 'name',
        label: 'Name',
        editor: 'string',
        validation: {
          required: true,
          minLength: 3,
          maxLength: 50,
          pattern: '^[a-zA-Z0-9_]+$',
        },
      };
      expect(def.editor).toBe('string');
      expect(def.validation?.minLength).toBe(3);
      expect(def.validation?.maxLength).toBe(50);
      expect(def.validation?.pattern).toBe('^[a-zA-Z0-9_]+$');
    });

    it('should support number editor with validation', () => {
      const def: NumberPropertyDefinition = {
        key: 'port',
        label: 'Port',
        editor: 'number',
        validation: {
          required: true,
          min: 1,
          max: 65535,
          step: 1,
        },
      };
      expect(def.editor).toBe('number');
      expect(def.validation?.min).toBe(1);
      expect(def.validation?.max).toBe(65535);
      expect(def.validation?.step).toBe(1);
    });

    it('should support boolean editor', () => {
      const def: BooleanPropertyDefinition = {
        key: 'enabled',
        label: 'Enabled',
        editor: 'boolean',
        defaultValue: false,
      };
      expect(def.editor).toBe('boolean');
      expect(def.defaultValue).toBe(false);
    });

    it('should support select editor with options', () => {
      const def: SelectPropertyDefinition = {
        key: 'type',
        label: 'Type',
        editor: 'select',
        options: [
          { value: 'table', label: 'Table' },
          { value: 'view', label: 'View' },
          { value: 'procedure', label: 'Stored Procedure', disabled: true },
        ],
      };
      expect(def.editor).toBe('select');
      expect(def.options).toHaveLength(3);
      expect(def.options[2].disabled).toBe(true);
    });

    it('should support multiselect editor with options', () => {
      const def: MultiSelectPropertyDefinition = {
        key: 'tags',
        label: 'Tags',
        editor: 'multiselect',
        options: [
          { value: 'important', label: 'Important' },
          { value: 'urgent', label: 'Urgent' },
        ],
      };
      expect(def.editor).toBe('multiselect');
      expect(def.options).toHaveLength(2);
    });

    it('should support color editor', () => {
      const def: ColorPropertyDefinition = {
        key: 'backgroundColor',
        label: 'Background Color',
        editor: 'color',
        defaultValue: '#FF0000',
      };
      expect(def.editor).toBe('color');
      expect(def.defaultValue).toBe('#FF0000');
    });

    it('should support textarea editor', () => {
      const def: TextAreaPropertyDefinition = {
        key: 'description',
        label: 'Description',
        editor: 'textarea',
        validation: {
          maxLength: 500,
        },
      };
      expect(def.editor).toBe('textarea');
      expect(def.validation?.maxLength).toBe(500);
    });

    it('should support json editor', () => {
      const def: JsonPropertyDefinition = {
        key: 'config',
        label: 'Configuration',
        editor: 'json',
        defaultValue: {},
      };
      expect(def.editor).toBe('json');
      expect(def.defaultValue).toEqual({});
    });

    it('should support date editor', () => {
      const def: DatePropertyDefinition = {
        key: 'birthDate',
        label: 'Birth Date',
        editor: 'date',
      };
      expect(def.editor).toBe('date');
    });

    it('should support datetime editor', () => {
      const def: DateTimePropertyDefinition = {
        key: 'createdAt',
        label: 'Created At',
        editor: 'datetime',
      };
      expect(def.editor).toBe('datetime');
    });

    it('should support slider editor', () => {
      const def: SliderPropertyDefinition = {
        key: 'opacity',
        label: 'Opacity',
        editor: 'slider',
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 50,
      };
      expect(def.editor).toBe('slider');
      expect(def.min).toBe(0);
      expect(def.max).toBe(100);
      expect(def.step).toBe(1);
      expect(def.defaultValue).toBe(50);
    });

    it('should support file editor', () => {
      const def: FilePropertyDefinition = {
        key: 'avatar',
        label: 'Avatar',
        editor: 'file',
        accept: 'image/*',
      };
      expect(def.editor).toBe('file');
      expect(def.accept).toBe('image/*');
    });
  });

  describe('SelectOption', () => {
    it('should have value and label', () => {
      const option: SelectOption = {
        value: 'test',
        label: 'Test Option',
      };
      expect(option.value).toBe('test');
      expect(option.label).toBe('Test Option');
    });

    it('should allow disabled option', () => {
      const option: SelectOption = {
        value: 'disabled',
        label: 'Disabled Option',
        disabled: true,
      };
      expect(option.disabled).toBe(true);
    });
  });

  describe('PropertyValidation', () => {
    it('should define required validation', () => {
      const validation: PropertyValidation = {
        required: true,
      };
      expect(validation.required).toBe(true);
    });

    it('should support string validation', () => {
      const validation: PropertyValidation = {
        required: true,
        minLength: 3,
        maxLength: 50,
        pattern: '^[A-Z][a-z]+$',
      };
      expect(validation.minLength).toBe(3);
      expect(validation.maxLength).toBe(50);
      expect(validation.pattern).toBeDefined();
    });

    it('should support number validation', () => {
      const validation: PropertyValidation = {
        min: 0,
        max: 100,
        step: 5,
      };
      expect(validation.min).toBe(0);
      expect(validation.max).toBe(100);
      expect(validation.step).toBe(5);
    });

    it('should support custom validation function', () => {
      const validation: PropertyValidation = {
        custom: (value: any, allValues: Record<string, any>) => {
          if (value === allValues['otherField']) {
            return { message: 'Cannot match other field' };
          }
          return null;
        },
      };
      expect(validation.custom).toBeDefined();

      // Test custom validator
      const result = validation.custom!('test', { otherField: 'test' });
      expect(result).not.toBeNull();
      expect(result?.message).toContain('Cannot match');

      const noError = validation.custom!('test', { otherField: 'different' });
      expect(noError).toBeNull();
    });
  });

  describe('ValidationError', () => {
    it('should have message', () => {
      const error: ValidationError = {
        message: 'Field is required',
      };
      expect(error.message).toBe('Field is required');
    });

    it('should allow optional code', () => {
      const error: ValidationError = {
        message: 'Invalid format',
        code: 'INVALID_FORMAT',
      };
      expect(error.code).toBe('INVALID_FORMAT');
    });
  });

  describe('ValidationResult', () => {
    it('should have valid flag and errors array', () => {
      const result: ValidationResult = {
        valid: false,
        errors: [{ message: 'Required field' }],
      };
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
    });

    it('should support valid result with no errors', () => {
      const result: ValidationResult = {
        valid: true,
        errors: [],
      };
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('PropertyCondition', () => {
    it('should support simple equality condition', () => {
      const condition: PropertyCondition = {
        property: 'useCustomColor',
        operator: '==',
        value: true,
      };
      expect(condition.operator).toBe('==');
      expect(condition.property).toBe('useCustomColor');
      expect(condition.value).toBe(true);
    });

    it('should support comparison operators', () => {
      const condition: PropertyCondition = {
        property: 'nodeCount',
        operator: '>',
        value: 100,
      };
      expect(condition.operator).toBe('>');
      expect(condition.value).toBe(100);
    });

    it('should support contains operator', () => {
      const condition: PropertyCondition = {
        property: 'tags',
        operator: 'contains',
        value: 'important',
      };
      expect(condition.operator).toBe('contains');
    });

    it('should support all condition operators', () => {
      const operators: ConditionOperator[] = [
        '==',
        '!=',
        '>',
        '<',
        '>=',
        '<=',
        'contains',
        'in',
        'matches',
      ];
      expect(operators).toHaveLength(9);
    });
  });

  describe('ComplexPropertyCondition', () => {
    it('should support complex AND conditions', () => {
      const complex: ComplexPropertyCondition = {
        and: [
          { property: 'enabled', operator: '==', value: true },
          { property: 'nodeCount', operator: '>', value: 10 },
        ],
      };
      expect(complex.and).toHaveLength(2);
      expect(complex.and![0].property).toBe('enabled');
      expect(complex.and![1].operator).toBe('>');
    });

    it('should support complex OR conditions', () => {
      const complex: ComplexPropertyCondition = {
        or: [
          { property: 'type', operator: '==', value: 'table' },
          { property: 'type', operator: '==', value: 'view' },
        ],
      };
      expect(complex.or).toHaveLength(2);
      expect(complex.or![0].value).toBe('table');
      expect(complex.or![1].value).toBe('view');
    });
  });

  describe('PropertyGroup', () => {
    it('should define basic group', () => {
      const group: PropertyGroup = {
        name: 'appearance',
        label: 'Appearance',
      };
      expect(group.name).toBe('appearance');
      expect(group.label).toBe('Appearance');
    });

    it('should support collapsed state', () => {
      const group: PropertyGroup = {
        name: 'advanced',
        label: 'Advanced Settings',
        collapsed: true,
        order: 10,
      };
      expect(group.collapsed).toBe(true);
      expect(group.order).toBe(10);
    });

    it('should support all optional fields', () => {
      const group: PropertyGroup = {
        name: 'styling',
        label: 'Styling',
        description: 'Visual appearance settings',
        collapsed: false,
        order: 2,
        icon: 'palette',
      };
      expect(group.description).toBe('Visual appearance settings');
      expect(group.icon).toBe('palette');
    });
  });

  describe('PropertySchema', () => {
    it('should define complete schema', () => {
      const schema: PropertySchema = {
        properties: [
          {
            key: 'tableName',
            label: 'Table Name',
            editor: 'string',
            validation: { required: true },
            group: 'basic',
          },
          {
            key: 'columns',
            label: 'Columns',
            editor: 'json',
            group: 'schema',
          },
          {
            key: 'primaryKey',
            label: 'Primary Key',
            editor: 'select',
            options: [],
            group: 'schema',
          } as SelectPropertyDefinition,
        ],
        groups: [
          { name: 'basic', label: 'Basic Information', order: 1 },
          { name: 'schema', label: 'Schema', order: 2 },
        ],
        metadata: {
          version: '1.0.0',
          description: 'Property schema for database tables',
        },
      };

      expect(schema.properties).toHaveLength(3);
      expect(schema.groups).toHaveLength(2);
      expect(schema.metadata?.version).toBe('1.0.0');
    });

    it('should allow schema without groups', () => {
      const schema: PropertySchema = {
        properties: [
          {
            key: 'name',
            label: 'Name',
            editor: 'string',
          },
        ],
      };
      expect(schema.properties).toHaveLength(1);
      expect(schema.groups).toBeUndefined();
    });

    it('should allow schema without metadata', () => {
      const schema: PropertySchema = {
        properties: [
          {
            key: 'name',
            label: 'Name',
            editor: 'string',
          },
        ],
      };
      expect(schema.metadata).toBeUndefined();
    });

    it('should combine all elements', () => {
      const schema: PropertySchema = {
        properties: [
          {
            key: 'name',
            label: 'Name',
            editor: 'string',
            validation: { required: true },
            group: 'basic',
          },
          {
            key: 'enabled',
            label: 'Enabled',
            editor: 'boolean',
            group: 'basic',
          },
          {
            key: 'color',
            label: 'Color',
            editor: 'color',
            condition: { property: 'enabled', operator: '==', value: true },
            group: 'appearance',
          },
        ],
        groups: [
          { name: 'basic', label: 'Basic', order: 1 },
          { name: 'appearance', label: 'Appearance', order: 2 },
        ],
      };

      expect(schema.properties).toHaveLength(3);
      expect(schema.groups).toHaveLength(2);
      expect(schema.properties[2].condition).toBeDefined();
    });
  });
});
