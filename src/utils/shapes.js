import PropTypes from 'prop-types';

export const UserShape = PropTypes.shape({
  id: PropTypes.string.isRequired,
  email: PropTypes.string,
  full_name: PropTypes.string,
  avatar_url: PropTypes.string,
});

export const ProjectShape = PropTypes.shape({
  id: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  owner_id: PropTypes.string.isRequired,
  members: PropTypes.arrayOf(UserShape),
});

export const TaskShape = PropTypes.shape({
  id: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  status: PropTypes.oneOf(['todo', 'in_progress', 'done', 'blocked']),
  due_date: PropTypes.string,
  assignee_id: PropTypes.string,
  assignee: UserShape,
  is_complete: PropTypes.bool,
  children: PropTypes.arrayOf(PropTypes.object),
});
