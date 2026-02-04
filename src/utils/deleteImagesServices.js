import cloudinary from 'cloudinary';

const deleteImage = async (
  path,
  folder = 'profileImages',
  resourceType = 'image',
) => {
  if (path) {
    const publicId = path.split('/').pop().split('.')[0];
    if (folder) {
      await cloudinary.uploader.destroy(`${folder}/${publicId}`, {
        resource_type: resourceType,
      });
    }
  }
};

export default deleteImage;
