import {
  Injectable,
  // BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { User } from './schema/user.schema';
import { Model } from 'mongoose';
import { CreateUserDto } from './dto/create-user.dto';
import { Restaurant } from '@/restaurant/schema/restaurant.schema';
import { Attraction } from '@/attraction/schema/attraction.schema';
import { SavePlaceDto } from './dto/save-place.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Multer } from 'multer';
import { FileUploadService } from '@/file/file.service';
import { PhotoType } from '@/schema/photo.schema';
import { EditPasswordDto } from '@/auth/dto/edit-password.dto';

interface CurrentUser {
  _id: string;
  savedAttractions?: string[];
  savedRestaurants?: string[];
}

@Injectable()
export class UserService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Restaurant.name) private restaurantModel: Model<Restaurant>,
    @InjectModel(Attraction.name) private attractionModel: Model<Attraction>,
    private fileUploadService: FileUploadService
  ) {}

  getMe(currentUser): User {
    return currentUser;
  }

  async findOne(id: string): Promise<User> {
    const user = await this.userModel.findById(id).exec();
    if (!user) {
      throw new NotFoundException('User not existed');
    }
    return user;
  }

  async create(createUserDto: CreateUserDto): Promise<User> {
    const existingUser = await this.userModel.findOne({ email: createUserDto.email });
    if (existingUser) {
      throw new ConflictException('User already exists');
    }

    const nicknameParts = createUserDto.email?.split('@');
    let nickname = nicknameParts ? nicknameParts[0] : '';

    const sameNicknameUser = await this.userModel.find({ nickname: nickname });
    if (sameNicknameUser.length > 0) {
      const similarNicknameUser = await this.userModel.find({
        nickname: { $regex: `^${nickname}#` },
      });
      const number = similarNicknameUser.length + 1;
      nickname = `${nickname}#${number}`;
    }

    const newUser = new this.userModel({ ...createUserDto, nickname });
    return newUser.save();
  }

  async updateUser(
    userId: string,
    updateUserDto: UpdateUserDto,
    avatarFile: Multer.File
  ): Promise<User> {
    const existingUser = await this.userModel.findById(userId).exec();
    if (!existingUser) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
    const updateData = { ...updateUserDto };

    if (avatarFile) {
      const uploadResults = await this.fileUploadService.uploadPhoto(
        userId,
        [avatarFile],
        PhotoType.USER
      );

      const photoDocuments = uploadResults.map((result) => {
        // Map to CreatePhotoDto
        return {
          imageUrl: result.data.imageUrl,
          imageAlt: result.data.imageAlt,
          imageType: PhotoType.USER,
          uploadUserId: result.data.uploadUserId, // Use @CurrentUser decorator to get the current user ID
        };
      });

      // using findOneAndUpdate update user date with photo change
      const updatedUser = await this.userModel.findOneAndUpdate(
        { _id: userId },
        { $set: { ...updateData, userAvatar: photoDocuments } },
        { new: true }
      );

      return updatedUser as User;
    }
    // using findOneAndUpdate update user date, photo does not change
    const updatedUser = await this.userModel.findOneAndUpdate(
      { _id: userId },
      { $set: { ...updateData } },
      { new: true }
    );

    return updatedUser as User;
  }

  async addSavedPlace(currentUser: CurrentUser, savePlaceDto: SavePlaceDto): Promise<void> {
    const user = currentUser;
    let place;

    user.savedRestaurants = user.savedRestaurants || [];
    user.savedAttractions = user.savedAttractions || [];
    if (
      user.savedAttractions.includes(savePlaceDto.placeId) ||
      user.savedRestaurants.includes(savePlaceDto.placeId)
    ) {
      return;
    }

    if (savePlaceDto.placeType === 'Restaurant') {
      place = await this.restaurantModel.findById(savePlaceDto.placeId);
      if (!place) {
        throw new NotFoundException('Restaurant not found');
      }
      const newSavedList = [...user.savedRestaurants];
      newSavedList.push(place._id);
      const newUserData = { savedRestaurants: newSavedList };
      await this.userModel.findByIdAndUpdate(user['_id'], newUserData, { new: true }).exec();
      return;
    } else if (savePlaceDto.placeType === 'Attraction') {
      place = await this.attractionModel.findById(savePlaceDto.placeId);
      if (!place) {
        throw new NotFoundException('Attraction not found');
      }
      const newSavedList = [...user.savedAttractions];
      newSavedList.push(place._id);
      const newUserData = { savedAttractions: newSavedList };
      await this.userModel.findByIdAndUpdate(user['_id'], newUserData, { new: true }).exec();
      return;
    }
  }

  // async deleteSavedPlace(
  //   userId: string,
  //   savePlaceDto: SavePlaceDto
  // ): Promise<{ savedRestaurants: Restaurant[] } | { savedAttractions: Attraction[] } | undefined> {
  //   let place;

  //   if (savePlaceDto.placeType === 'Restaurant') {
  //     place = await this.restaurantModel.findById(savePlaceDto.placeId);
  //   } else if (savePlaceDto.placeType === 'Attraction') {
  //     place = await this.attractionModel.findById(savePlaceDto.placeId);
  //   }

  //   if (!place) {
  //     throw new BadRequestException('Place not found');
  //   }

  //   const user = await this.userModel.findById(userId);
  //   if (!user) {
  //     throw new BadRequestException('User not found');
  //   }

  //   if (savePlaceDto.placeType === 'Restaurant') {
  //     const index = user.savedRestaurants.indexOf(place._id);
  //     if (index > -1) {
  //       user.savedRestaurants.splice(index, 1);
  //       await user.save();
  //       return { savedRestaurants: user.savedRestaurants };
  //     }
  //   } else if (savePlaceDto.placeType === 'Attraction') {
  //     const index = user.savedAttractions.indexOf(place._id);
  //     if (index > -1) {
  //       user.savedAttractions.splice(index, 1);
  //       await user.save();
  //       return { savedAttractions: user.savedAttractions };
  //     }
  //   }
  // }

  async updatePassword(userId: string, newPassword: EditPasswordDto) {
    const { newPassword: checkedNewpassword } = newPassword;
    const res = await this.userModel.updateOne(
      { _id: userId },
      { $set: { password: checkedNewpassword } },
      { new: true }
    );
    return res;
  }
}
