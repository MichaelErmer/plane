# Python imports
import uuid

from django.contrib.auth.hashers import make_password
from django.core.exceptions import ValidationError
from django.core.validators import validate_email

# Django imports
from django.utils import timezone

# Third party imports
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from plane.app.serializers import UserMeSerializer

# Module imports
from plane.app.views import BaseAPIView
from plane.db.models import User
from plane.license.api.permissions import (
    InstanceAdminPermission,
)
from plane.license.api.serializers import (
    InstanceAdminSerializer,
    InstanceConfigurationSerializer,
    InstanceSerializer,
)
from plane.license.models import Instance, InstanceAdmin, InstanceConfiguration
from plane.license.utils.encryption import encrypt_data
from plane.utils.cache import cache_response, invalidate_cache


class InstanceEndpoint(BaseAPIView):
    def get_permissions(self):
        if self.request.method == "PATCH":
            return [
                InstanceAdminPermission(),
            ]
        return [
            AllowAny(),
        ]

    @cache_response(60 * 60 * 2, user=False)
    def get(self, request):
        instance = Instance.objects.first()
        # get the instance
        if instance is None:
            return Response(
                {"is_activated": False, "is_setup_done": False},
                status=status.HTTP_200_OK,
            )
        # Return instance
        serializer = InstanceSerializer(instance)
        data = serializer.data
        data["is_activated"] = True
        return Response(data, status=status.HTTP_200_OK)

    @invalidate_cache(path="/api/instances/", user=False)
    def patch(self, request):
        # Get the instance
        instance = Instance.objects.first()
        serializer = InstanceSerializer(
            instance, data=request.data, partial=True
        )
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class InstanceAdminEndpoint(BaseAPIView):
    permission_classes = [
        InstanceAdminPermission,
    ]

    @invalidate_cache(path="/api/instances/", user=False)
    # Create an instance admin
    def post(self, request):
        email = request.data.get("email", False)
        role = request.data.get("role", 20)

        if not email:
            return Response(
                {"error": "Email is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        instance = Instance.objects.first()
        if instance is None:
            return Response(
                {"error": "Instance is not registered yet"},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Fetch the user
        user = User.objects.get(email=email)

        instance_admin = InstanceAdmin.objects.create(
            instance=instance,
            user=user,
            role=role,
        )
        serializer = InstanceAdminSerializer(instance_admin)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @cache_response(60 * 60 * 2)
    def get(self, request):
        instance = Instance.objects.first()
        if instance is None:
            return Response(
                {"error": "Instance is not registered yet"},
                status=status.HTTP_403_FORBIDDEN,
            )
        instance_admins = InstanceAdmin.objects.filter(instance=instance)
        serializer = InstanceAdminSerializer(instance_admins, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @invalidate_cache(path="/api/instances/", user=False)
    def delete(self, request, pk):
        instance = Instance.objects.first()
        InstanceAdmin.objects.filter(instance=instance, pk=pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class InstanceConfigurationEndpoint(BaseAPIView):
    permission_classes = [
        InstanceAdminPermission,
    ]

    @cache_response(60 * 60 * 2, user=False)
    def get(self, request):
        instance_configurations = InstanceConfiguration.objects.all()
        serializer = InstanceConfigurationSerializer(
            instance_configurations, many=True
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

    @invalidate_cache(path="/api/configs/", user=False)
    @invalidate_cache(path="/api/mobile-configs/", user=False)
    def patch(self, request):
        configurations = InstanceConfiguration.objects.filter(
            key__in=request.data.keys()
        )

        bulk_configurations = []
        for configuration in configurations:
            value = request.data.get(configuration.key, configuration.value)
            if configuration.is_encrypted:
                configuration.value = encrypt_data(value)
            else:
                configuration.value = value
            bulk_configurations.append(configuration)

        InstanceConfiguration.objects.bulk_update(
            bulk_configurations, ["value"], batch_size=100
        )

        serializer = InstanceConfigurationSerializer(configurations, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class InstanceAdminSignInEndpoint(BaseAPIView):
    permission_classes = [
        AllowAny,
    ]

    @invalidate_cache(path="/api/instances/", user=False)
    def post(self, request):
        # Check instance first
        instance = Instance.objects.first()
        if instance is None:
            return Response(
                {"error": "Instance is not configured"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # check if the instance is already activated
        if InstanceAdmin.objects.first():
            return Response(
                {"error": "Admin for this instance is already registered"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Get the email and password from all the user
        email = request.data.get("email", False)
        password = request.data.get("password", False)

        # return error if the email and password is not present
        if not email or not password:
            return Response(
                {"error": "Email and password are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate the email
        email = email.strip().lower()
        try:
            validate_email(email)
        except ValidationError:
            return Response(
                {"error": "Please provide a valid email address."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check if already a user exists or not
        user = User.objects.filter(email=email).first()

        # Existing user
        if user:
            # Check user password
            if not user.check_password(password):
                return Response(
                    {
                        "error": "Sorry, we could not find a user with the provided credentials. Please try again."
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )
        else:
            user = User.objects.create(
                email=email,
                username=uuid.uuid4().hex,
                password=make_password(password),
                is_password_autoset=False,
            )

        # settings last active for the user
        user.is_active = True
        user.last_active = timezone.now()
        user.last_login_time = timezone.now()
        user.last_login_ip = request.META.get("REMOTE_ADDR")
        user.last_login_uagent = request.META.get("HTTP_USER_AGENT")
        user.token_updated_at = timezone.now()
        user.save()

        # Register the user as an instance admin
        _ = InstanceAdmin.objects.create(
            user=user,
            instance=instance,
        )
        # Make the setup flag True
        instance.is_setup_done = True
        instance.save()

        # get tokens for user
        serializer = UserMeSerializer(user)
        return Response(serializer.data, status=status.HTTP_200_OK)


class SignUpScreenVisitedEndpoint(BaseAPIView):
    permission_classes = [
        AllowAny,
    ]

    @invalidate_cache(path="/api/instances/", user=False)
    def post(self, request):
        instance = Instance.objects.first()
        if instance is None:
            return Response(
                {"error": "Instance is not configured"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        instance.is_signup_screen_visited = True
        instance.save()
        return Response(status=status.HTTP_204_NO_CONTENT)
