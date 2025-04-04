// Mock Auth0 forms data for testing
export const mockForms = [
  {
    id: 'form1',
    name: 'Test Form 1',
    messages: {
      success: 'Form submitted successfully',
    },
    languages: {
      default: 'en',
      supported: ['en', 'es'],
    },
    translations: {
      en: {
        title: 'Test Form',
        submit: 'Submit',
      },
      es: {
        title: 'Formulario de Prueba',
        submit: 'Enviar',
      },
    },
    nodes: [
      {
        id: 'node1',
        type: 'text',
        label: 'Name',
        required: true,
      },
      {
        id: 'node2',
        type: 'email',
        label: 'Email',
        required: true,
      },
    ],
    start: {
      node: 'node1',
    },
    ending: {
      redirect: 'https://example.com/thank-you',
    },
    style: {
      theme: 'light',
    },
  },
  {
    id: 'form2',
    name: 'Test Form 2',
    messages: {
      success: 'Thank you for your submission',
    },
    languages: {
      default: 'en',
      supported: ['en'],
    },
    translations: {
      en: {
        title: 'Another Test Form',
        submit: 'Submit',
      },
    },
    nodes: [
      {
        id: 'node1',
        type: 'text',
        label: 'Full Name',
        required: true,
      },
    ],
    start: {
      node: 'node1',
    },
    ending: {
      message: 'Thank you for your submission',
    },
    style: {
      theme: 'dark',
    },
  },
];

// Mock form list response
export const mockFormListResponse = {
  forms: mockForms,
  total: mockForms.length,
  page: 0,
  per_page: 50,
};

// Mock single form response
export const mockSingleForm = mockForms[0];

// Mock create form response
export const mockCreateFormResponse = {
  id: 'new-form-id',
  name: 'New Test Form',
  messages: {
    success: 'Form created successfully',
  },
  languages: {
    default: 'en',
    supported: ['en'],
  },
  translations: {
    en: {
      title: 'New Form',
      submit: 'Submit',
    },
  },
  nodes: [
    {
      id: 'node1',
      type: 'text',
      label: 'Name',
      required: true,
    },
  ],
  start: {
    node: 'node1',
  },
  ending: {
    message: 'Thank you',
  },
  style: {
    theme: 'light',
  },
};

// Mock update form response
export const mockUpdateFormResponse = {
  ...mockForms[0],
  name: 'Updated Test Form',
  messages: {
    success: 'Form updated successfully',
  },
};
