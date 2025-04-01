// Mock Auth0 forms data for testing
export const mockForms = [
  {
    id: 'form_1',
    name: 'login',
    prompt: 'login',
    status: 'enabled',
    is_active: true,
    layout: {
      form_elements: [
        {
          label: 'Email',
          type: 'text',
          name: 'email',
          placeholder: 'Enter your email',
          required: true,
        },
        {
          label: 'Password',
          type: 'password',
          name: 'password',
          placeholder: 'Enter your password',
          required: true,
        },
      ],
      submit_button: {
        text: 'Log In',
      },
    },
  },
  {
    id: 'form_2',
    name: 'signup',
    prompt: 'signup',
    status: 'enabled',
    is_active: true,
    layout: {
      form_elements: [
        {
          label: 'Email',
          type: 'text',
          name: 'email',
          placeholder: 'Enter your email',
          required: true,
        },
        {
          label: 'Password',
          type: 'password',
          name: 'password',
          placeholder: 'Create a password',
          required: true,
        },
        {
          label: 'Confirm Password',
          type: 'password',
          name: 'confirm_password',
          placeholder: 'Confirm your password',
          required: true,
        },
      ],
      submit_button: {
        text: 'Sign Up',
      },
    },
  },
];

// Mock single form response
export const mockSingleForm = mockForms[0];

// Mock update form response
export const mockUpdateFormResponse = {
  ...mockForms[0],
  layout: {
    ...mockForms[0].layout,
    form_elements: [
      ...mockForms[0].layout.form_elements,
      {
        label: 'Remember Me',
        type: 'checkbox',
        name: 'remember_me',
        required: false,
      },
    ],
  },
};
